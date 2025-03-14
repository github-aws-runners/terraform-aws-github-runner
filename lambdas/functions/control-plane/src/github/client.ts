import { createAppAuth } from '@octokit/auth-app';
import { StrategyOptions } from '@octokit/auth-app/dist-types/types';
import { OctokitOptions } from '@octokit/core/dist-types/types';
import { Octokit } from '@octokit/rest';
import { throttling } from '@octokit/plugin-throttling';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { EndpointDefaults, type OctokitResponse } from '@octokit/types';
import { RequestError } from '@octokit/request-error';
import { Lru } from 'toad-cache';
import type { ActionRequestMessage } from '../scale-runners/scale-up';

const logger = createChildLogger('gh-auth');

interface CacheEntry {
  etag?: string;
  lastModified?: string;
  [key: string]: unknown;
}


// Cache for conditional requests
// Using 15000 entries with 5 minute TTL
const cache = new Lru<CacheEntry>(15000, 5 * 60 * 1000);

async function appAuthCommonParameters(): Promise<StrategyOptions> {
  const appId = parseInt(await getParameter(process.env.PARAMETER_GITHUB_APP_ID_NAME));

  return {
    appId,
    privateKey: Buffer.from(
      await getParameter(process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME),
      'base64',
      // replace literal \n characters with new lines to allow the key to be stored as a
      // single line variable. This logic should match how the GitHub Terraform provider
      // processes private keys to retain compatibility between the projects
    )
      .toString()
      .replace('/[\\n]/g', String.fromCharCode(10)),
  };
}

/**
 * Handler run before requests are sent. Looks up the URL in the cache, and adds
 * headers for conditional retrieval if there is an entry.
 */
async function beforeRequestHandler(octokit: Octokit, options: Required<EndpointDefaults>): Promise<void> {
  const { method } = options;

  if (method !== 'GET') {
    return;
  }

  const { url } = octokit.request.endpoint.parse(options);
  const cacheKey = url;
  const cacheEntry = cache.get(cacheKey);

  if (cacheEntry === undefined) {
    logger.info('Cache miss', { url });
    return;
  }

  const { etag, lastModified } = cacheEntry;

  if (etag !== undefined) {
    options.headers['If-None-Match'] = etag;
  }

  if (lastModified !== undefined) {
    options.headers['If-Modified-Since'] = lastModified;
  }

  logger.info('Cache hit', { url, etag, lastModified });
}

/**
 * Handler run after requests are sent. Caches the response if it has an ETag or
 * Last-Modified header, so that it can be returned by future conditional
 * requests if requested again.
 */
async function afterRequestHandler(octokit: Octokit, response: OctokitResponse<any, number>, options: Required<EndpointDefaults>): Promise<void> {
  const { status } = response;
  const { url } = octokit.request.endpoint.parse(options);
  logger.info(`Response received`, { status, url });

  const cacheKey = url;
  const eTag = response.headers.etag;
  const lastModified = response.headers['last-modified'];

  if (eTag === undefined && lastModified === undefined) {
    return;
  }

  logger.info('Caching response', { url, eTag, lastModified });

  cache.set(cacheKey, {
    ...(eTag !== undefined ? { etag: eTag } : {}),
    ...(lastModified !== undefined ? { lastModified } : {}),
    ...response,
  });
}

/**
 * Handler run if a request fails. This handler is called for any non-2xx
 * response. We will get "304 Not Modified" responses when the conditional
 * request is satisfied, and we should return the cached data in that case.
 */
async function errorRequestHandler(octokit: Octokit, error: Error, options: Required<EndpointDefaults>): Promise<CacheEntry> {
  if (!(error instanceof RequestError)) {
    throw error;
  }

  const { status } = error;

  if (status != 304) {
    throw error;
  }

  const { url } = octokit.request.endpoint.parse(options);

  const entry = cache.get(url);

  if (entry === undefined) {
      throw new Error(`Received 304 Not Modified response for ${url}, but it wasn't found in the cache.`);
  }

  return entry;
}

export async function createAppAuthClient(ghesApiUrl: string = ''): Promise<Octokit> {
  const CustomOctokit = Octokit.plugin(throttling);

  const octokit = new CustomOctokit({
    authStrategy: createAppAuth,
    auth: await appAuthCommonParameters(),
    baseUrl: ghesApiUrl || undefined,
    previews: ghesApiUrl ? ['antiope'] : undefined,
    throttle: {
      onRateLimit: (retryAfter: number, options: Required<EndpointDefaults>) => {
        logger.warn(`GitHub rate limit: Request quota exhausted for request ${options.method} ${options.url}.`, {
          retryAfter,
        });
      },
      onSecondaryRateLimit: (retryAfter: number, options: Required<EndpointDefaults>) => {
        logger.warn(`GitHub rate limit: SecondaryRateLimit detected for request ${options.method} ${options.url}`, {
          retryAfter,
        });
      },
    },
    userAgent: process.env.USER_AGENT || 'github-aws-runners',
  });

  octokit.hook.before('request', async (options) => beforeRequestHandler(octokit, options));
  octokit.hook.after('request', async (response, options) => afterRequestHandler(octokit, response, options));
  octokit.hook.error('request', async (error, options) => errorRequestHandler(octokit, error, options));

  return octokit;
}

async function getInstallationId(
  appClient: Octokit,
  enableOrgLevel: boolean,
  payload: ActionRequestMessage,
): Promise<number> {
  if (payload.installationId !== 0) {
    return payload.installationId;
  }

  return (
    enableOrgLevel
      ? await appClient.apps.getOrgInstallation({
          org: payload.repositoryOwner,
        })
      : await appClient.apps.getRepoInstallation({
          owner: payload.repositoryOwner,
          repo: payload.repositoryName,
        })
  ).data.id;
}

export async function createAppInstallationClient(appOctokit: Octokit, enableOrgLevel: boolean, payload: ActionRequestMessage): Promise<Octokit> {
  const installationId = await getInstallationId(appOctokit, enableOrgLevel, payload);

  return appOctokit.auth({
    type: 'installation',
    installationId,
    factory: ({ octokitOptions, ...auth }: { octokitOptions: OctokitOptions }) =>
      new Octokit({
        ...octokitOptions,
        auth: auth,
      }),
  }) as Promise<Octokit>;
}

export function getGitHubEnterpriseApiUrl() {
  const ghesBaseUrl = process.env.GHES_URL;
  let ghesApiUrl = '';
  if (ghesBaseUrl) {
    const url = new URL(ghesBaseUrl);
    const domain = url.hostname;
    if (domain.endsWith('.ghe.com')) {
      // Data residency: Prepend 'api.'
      ghesApiUrl = `https://api.${domain}`;
    } else {
      // GitHub Enterprise Server: Append '/api/v3'
      ghesApiUrl = `${ghesBaseUrl}/api/v3`;
    }
  }
  logger.debug(`Github Enterprise URLs: api_url - ${ghesApiUrl}; base_url - ${ghesBaseUrl}`);
  return { ghesApiUrl, ghesBaseUrl };
}

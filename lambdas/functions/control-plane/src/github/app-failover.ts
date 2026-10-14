import type { Octokit } from '@octokit/rest';
import type { ResponseHeaders } from '@octokit/types';
import type { GitHubAppCredentialsStore } from '@aws-github-runner/storage-providers';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { reportAppRateLimit, reportAppSecondaryRateLimit, selectAppIndex } from './auth';
import { metricGitHubAppRateLimit } from './rate-limit';

const logger = createChildLogger('github-app-failover');

type GitHubError = {
  status?: number;
  message?: string;
  response?: { status?: number; headers?: ResponseHeaders };
};

function rateLimit(error: unknown): { headers: ResponseHeaders; until: number; primary: boolean } | undefined {
  if (!error || typeof error !== 'object') return;
  const failure = error as GitHubError;
  const status = failure.status ?? failure.response?.status;
  const headers = failure.response?.headers ?? {};
  if (
    status !== 429 &&
    !(
      status === 403 &&
      (headers['x-ratelimit-remaining'] === '0' ||
        headers['retry-after'] !== undefined ||
        /rate limit|abuse/i.test(failure.message ?? ''))
    )
  )
    return;

  const now = Date.now();
  const retryAfter = headers['retry-after'];
  const seconds = Number(retryAfter);
  const retryAt =
    retryAfter === undefined ? NaN : Number.isFinite(seconds) ? now + seconds * 1000 : Date.parse(String(retryAfter));
  const resetAt = headers['x-ratelimit-remaining'] === '0' ? Number(headers['x-ratelimit-reset']) * 1000 : NaN;
  // Never sleep inside a Lambda. Keep this app unavailable until the server's
  // deadline (at least a minute when GitHub gives no usable deadline).
  const deadlines = [retryAt, resetAt].filter((value) => Number.isFinite(value) && value > now);
  return {
    headers,
    until: deadlines.length ? Math.max(...deadlines) + 1000 : now + 60_000,
    primary:
      headers['x-ratelimit-remaining'] === '0' &&
      retryAfter === undefined &&
      !/secondary|abuse/i.test(failure.message ?? ''),
  };
}

function observe(appIndex: number, headers: ResponseHeaders): void {
  const remaining = Number(headers['x-ratelimit-remaining']);
  const resetAt = Number(headers['x-ratelimit-reset']) * 1000;
  if (Number.isFinite(remaining))
    reportAppRateLimit(
      appIndex,
      remaining,
      Number.isFinite(resetAt) ? resetAt : undefined,
      String(headers['x-ratelimit-resource'] ?? 'core'),
    );
}

/**
 * One bounded failover loop for installation lookup, token minting, and each
 * API request. The factory must resolve the installation for the supplied app.
 * Only rejected rate-limited requests are replayed, never a runner lifecycle.
 */
export async function withAppFailover(
  initialAppIndex: number,
  createClient: (appIndex: number) => Promise<Octokit>,
  credentialsStore?: GitHubAppCredentialsStore,
): Promise<Octokit> {
  // Supplied stores may perform SSM reads; selection must not reload secrets
  // for every GitHub request in the batch.
  const credentials = credentialsStore?.get();
  const selectionStore = credentials ? { get: () => credentials } : undefined;
  const resources = new Map<string, string>();
  const clients = new Map<number, Promise<Octokit>>();
  const getClient = (appIndex: number) => {
    let client = clients.get(appIndex);
    if (!client) {
      client = createClient(appIndex).catch((error) => {
        clients.delete(appIndex);
        throw error;
      });
      clients.set(appIndex, client);
    }
    return client;
  };

  async function attempt<T>(run: (index: number) => Promise<T>, first?: number, resource = 'core'): Promise<T> {
    const tried = new Set<number>();
    let index = await selectAppIndex(selectionStore, tried, resource, first);
    for (;;) {
      tried.add(index);
      try {
        return await run(index);
      } catch (error) {
        const limited = rateLimit(error);
        if (!limited) throw error;
        resource = String(limited.headers['x-ratelimit-resource'] ?? resource);
        observe(index, limited.headers);
        await metricGitHubAppRateLimit(limited.headers, index, selectionStore);
        if (limited.primary) reportAppRateLimit(index, 0, limited.until, resource);
        else reportAppSecondaryRateLimit(index, limited.until);
        let next: number;
        try {
          next = await selectAppIndex(selectionStore, tried, resource);
        } catch {
          // Preserve the original HTTP error so existing queue retry paths work.
          throw error;
        }
        logger.warn('Retrying rate-limited GitHub request with another app', { appIndex: index, nextAppIndex: next });
        index = next;
      }
    }
  }

  const initial = await attempt(getClient, initialAppIndex);
  initial.hook.wrap('request', async (request, options) => {
    const route = `${options.method} ${options.url}`;
    return attempt(
      async (index) => {
        const client = await getClient(index);
        // Never forward a previous app's Authorization header on failover.
        const headers = { ...options.headers };
        delete headers.authorization;
        const response = await (client === initial
          ? request({ ...options, headers })
          : client.request({
              ...options,
              headers,
              request: { ...options.request, hook: client.request.endpoint.DEFAULTS.request?.hook, retryCount: 0 },
            }));
        resources.set(route, String(response.headers['x-ratelimit-resource'] ?? 'core'));
        observe(index, response.headers);
        await metricGitHubAppRateLimit(response.headers, index, selectionStore);
        return response;
      },
      undefined,
      resources.get(route) ??
        (options.method === 'POST' &&
        /\/(?:orgs\/[^/]+|repos\/[^/]+\/[^/]+)\/actions\/runners\/generate-jitconfig(?:\?.*)?$/.test(options.url)
          ? 'actions_runner_registration'
          : 'core'),
    );
  });
  return initial;
}

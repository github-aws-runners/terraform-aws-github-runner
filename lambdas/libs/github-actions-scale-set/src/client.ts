import { githubApiUrl, ParsedGitHubConfig, parseGitHubConfigUrl, runnerRegistrationTokenPath } from './config';
import { ACTIONS_API_VERSION, RUNNER_ENDPOINT, RUNNER_GROUP_ENDPOINT, SCALE_SET_ENDPOINT } from './endpoints';
import { ScaleSetProtocolError } from './errors';
import { createRetryingFetch, executeRequest, HttpResult, parseJsonResponse } from './http';
import { MessageSessionClient } from './message-session-client';
import {
  AccessTokenProvider,
  GitHubActionsScaleSetClientOptions,
  RunnerGroup,
  RunnerReference,
  RunnerScaleSet,
  RunnerScaleSetJitRunnerConfig,
  RunnerScaleSetJitRunnerSetting,
  ScaleSetFetch,
  ScaleSetRequestOptions,
  SystemInfo,
} from './types';

const ADMIN_TOKEN_REFRESH_SKEW_MS = 60_000;
const SUCCESS_STATUSES = Array.from({ length: 100 }, (_, index) => index + 200);

interface RegistrationTokenResponse {
  token?: string;
  expires_at?: string;
}

interface ActionsServiceAdminConnectionResponse {
  url?: string;
  token?: string;
}

interface ActionsServiceAdminToken {
  token: string;
  expiresAt: Date;
  url: string;
}

interface RunnerScaleSetListResponse {
  count: number;
  value: RunnerScaleSet[];
}

interface RunnerGroupListResponse {
  count: number;
  value: RunnerGroup[];
}

interface RunnerReferenceListResponse {
  count: number;
  value: RunnerReference[];
}

interface ActionsRequestOptions extends ScaleSetRequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  expectedStatuses: readonly number[];
  authorization?: string;
}

function joinUrlPath(base: string, path: string): string {
  if (base === '') {
    if (path === '') {
      return '';
    }
    return path.startsWith('/') ? path : `/${path}`;
  }
  if (path === '') {
    return base.replace(/\/+$/, '');
  }
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function actionsServiceUrl(
  base: string,
  path: string,
  query: Record<string, string | number | undefined> = {},
): URL {
  const [pathOnly, pathQuery = ''] = path.split('?', 2);
  const result = new URL(joinUrlPath(base, pathOnly));
  const mergedQuery = new URLSearchParams(pathQuery);

  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined) {
      mergedQuery.set(name, String(value));
    }
  }
  if (!mergedQuery.get('api-version')) {
    mergedQuery.set('api-version', ACTIONS_API_VERSION);
  }
  result.search = mergedQuery.toString();
  return result;
}

function encodeSystemUserAgent(systemInfo: SystemInfo): string {
  return JSON.stringify({
    system: systemInfo.system ?? '',
    version: systemInfo.version ?? '',
    commit_sha: systemInfo.commitSha ?? '',
    scale_set_id: systemInfo.scaleSetId ?? 0,
    subsystem: systemInfo.subsystem ?? '',
    build_version: '1.0.0',
    build_commit_sha: '',
    kind: 'scaleset',
  });
}

function parseJwtExpiration(token: string): Date {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new ScaleSetProtocolError('Actions service admin token is not a JWT');
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown;
  } catch (error) {
    throw new ScaleSetProtocolError('failed to decode Actions service admin token claims', {
      cause: error,
    });
  }

  if (
    typeof claims !== 'object' ||
    claims === null ||
    !('exp' in claims) ||
    typeof claims.exp !== 'number' ||
    !Number.isFinite(claims.exp)
  ) {
    throw new ScaleSetProtocolError('Actions service admin token is missing a numeric exp claim');
  }

  return new Date(claims.exp * 1000);
}

function applyDefaultLabelTypes(scaleSet: RunnerScaleSet): void {
  for (const label of scaleSet.labels ?? []) {
    label.type ||= 'System';
  }
}

function ensureLabels(scaleSet: RunnerScaleSet): void {
  if ((scaleSet.labels?.length ?? 0) > 0) {
    return;
  }
  if (!scaleSet.name) {
    throw new ScaleSetProtocolError('runner scale set must have a name or at least one label');
  }
  scaleSet.labels = [{ name: scaleSet.name, type: 'System' }];
}

function runnerScaleSetRequestBody(scaleSet: RunnerScaleSet): Record<string, unknown> {
  const wire = { ...scaleSet } as Record<string, unknown>;
  delete wire.runnerSetting;
  // The capital R is intentional and matches the Actions scale set wire contract.
  wire.RunnerSetting = scaleSet.runnerSetting ?? {};
  return wire;
}

function normalizeRunnerScaleSet(scaleSet: RunnerScaleSet | null): RunnerScaleSet | null {
  if (scaleSet === null) {
    return null;
  }

  const wire = scaleSet as RunnerScaleSet & { RunnerSetting?: RunnerScaleSet['runnerSetting'] };
  if (wire.runnerSetting === undefined && wire.RunnerSetting !== undefined) {
    wire.runnerSetting = wire.RunnerSetting;
  }
  delete wire.RunnerSetting;
  return wire;
}

/** A native-fetch client for the GitHub Actions runner scale set APIs. */
export class GitHubActionsScaleSetClient {
  private readonly config: ParsedGitHubConfig;
  private readonly fetchImplementation: ScaleSetFetch;
  private readonly adminConnectionFetchImplementation: ScaleSetFetch;
  private readonly accessTokenProvider: AccessTokenProvider;
  private readonly now: () => Date;
  private readonly customUserAgent?: string;
  private currentSystemInfo: SystemInfo;
  private currentUserAgent: string;
  private adminToken?: ActionsServiceAdminToken;
  private adminTokenRefresh?: Promise<ActionsServiceAdminToken>;

  constructor(options: GitHubActionsScaleSetClientOptions) {
    this.config = parseGitHubConfigUrl(options.gitHubConfigUrl, options.forceGhes);
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== 'function') {
      throw new TypeError('a fetch implementation is required');
    }
    this.fetchImplementation = createRetryingFetch(fetchImplementation, options.retry);
    // Upstream retries transient RemoteAuth propagation failures only for this
    // bootstrap call. Queue 401s must remain owned by session-token refresh.
    this.adminConnectionFetchImplementation = createRetryingFetch(fetchImplementation, options.retry, [401, 403]);

    const hasPersonalAccessToken =
      typeof options.personalAccessToken === 'string' && options.personalAccessToken !== '';
    const hasAccessTokenProvider = typeof options.accessTokenProvider === 'function';
    if (hasPersonalAccessToken === hasAccessTokenProvider) {
      throw new TypeError('provide exactly one of personalAccessToken or accessTokenProvider');
    }

    this.accessTokenProvider = hasPersonalAccessToken
      ? async () => options.personalAccessToken as string
      : (options.accessTokenProvider as AccessTokenProvider);
    this.now = options.now ?? (() => new Date());
    this.currentSystemInfo = { ...options.systemInfo };
    this.customUserAgent = options.userAgent;
    this.currentUserAgent = options.userAgent ?? encodeSystemUserAgent(this.currentSystemInfo);
  }

  get gitHubConfig(): ParsedGitHubConfig {
    return {
      ...this.config,
      configUrl: new URL(this.config.configUrl),
    };
  }

  get systemInfo(): SystemInfo {
    return { ...this.currentSystemInfo };
  }

  setSystemInfo(systemInfo: SystemInfo): void {
    this.currentSystemInfo = { ...systemInfo };
    if (this.customUserAgent === undefined) {
      this.currentUserAgent = encodeSystemUserAgent(systemInfo);
    }
  }

  debugInfo(): string {
    return JSON.stringify({
      system_info: this.currentUserAgent,
    });
  }

  async getRunnerScaleSet(
    runnerGroupId: number,
    runnerScaleSetName: string,
    options: ScaleSetRequestOptions = {},
  ): Promise<RunnerScaleSet | null> {
    const { result, url } = await this.actionsRequest('GET', SCALE_SET_ENDPOINT, {
      expectedStatuses: [200],
      query: { runnerGroupId, name: runnerScaleSetName },
      signal: options.signal,
    });
    const list = parseJsonResponse<RunnerScaleSetListResponse>(result, 'GET', url);

    if (list.count === 0) {
      return null;
    }
    if (list.count !== 1) {
      throw new ScaleSetProtocolError(
        `multiple runner scale sets found with name ${JSON.stringify(runnerScaleSetName)}`,
      );
    }
    if (list.value.length === 0) {
      throw new ScaleSetProtocolError('runner scale set response count was 1 but value was empty');
    }
    return normalizeRunnerScaleSet(list.value[0]);
  }

  async listRunnerScaleSets(runnerGroupId: number, options: ScaleSetRequestOptions = {}): Promise<RunnerScaleSet[]> {
    const { result, url } = await this.actionsRequest('GET', SCALE_SET_ENDPOINT, {
      expectedStatuses: [200],
      query: { runnerGroupId },
      signal: options.signal,
    });
    const list = parseJsonResponse<RunnerScaleSetListResponse>(result, 'GET', url);
    return list.value.map((scaleSet) => normalizeRunnerScaleSet(scaleSet) as RunnerScaleSet);
  }

  async getRunnerScaleSetById(
    runnerScaleSetId: number,
    options: ScaleSetRequestOptions = {},
  ): Promise<RunnerScaleSet | null> {
    const path = `/${SCALE_SET_ENDPOINT}/${runnerScaleSetId}`;
    const { result, url } = await this.actionsRequest('GET', path, {
      expectedStatuses: [200],
      signal: options.signal,
    });
    return normalizeRunnerScaleSet(parseJsonResponse<RunnerScaleSet | null>(result, 'GET', url));
  }

  async getRunnerGroupByName(runnerGroupName: string, options: ScaleSetRequestOptions = {}): Promise<RunnerGroup> {
    const { result, url } = await this.actionsRequest('GET', `/${RUNNER_GROUP_ENDPOINT}`, {
      expectedStatuses: [200],
      query: { groupName: runnerGroupName },
      signal: options.signal,
    });
    const list = parseJsonResponse<RunnerGroupListResponse>(result, 'GET', url);

    if (list.count === 0) {
      throw new ScaleSetProtocolError(`no runner group found with name ${JSON.stringify(runnerGroupName)}`);
    }
    if (list.count !== 1) {
      throw new ScaleSetProtocolError(`multiple runner groups found with name ${JSON.stringify(runnerGroupName)}`);
    }
    if (list.value.length === 0) {
      throw new ScaleSetProtocolError('runner group response count was 1 but value was empty');
    }
    return list.value[0];
  }

  async createRunnerScaleSet(scaleSet: RunnerScaleSet, options: ScaleSetRequestOptions = {}): Promise<RunnerScaleSet> {
    ensureLabels(scaleSet);
    applyDefaultLabelTypes(scaleSet);
    const { result, url } = await this.actionsRequest('POST', SCALE_SET_ENDPOINT, {
      body: runnerScaleSetRequestBody(scaleSet),
      expectedStatuses: [200],
      signal: options.signal,
    });
    return normalizeRunnerScaleSet(parseJsonResponse<RunnerScaleSet>(result, 'POST', url)) as RunnerScaleSet;
  }

  async updateRunnerScaleSet(
    runnerScaleSetId: number,
    scaleSet: RunnerScaleSet,
    options: ScaleSetRequestOptions = {},
  ): Promise<RunnerScaleSet> {
    applyDefaultLabelTypes(scaleSet);
    const path = `${SCALE_SET_ENDPOINT}/${runnerScaleSetId}`;
    const { result, url } = await this.actionsRequest('PATCH', path, {
      body: runnerScaleSetRequestBody(scaleSet),
      expectedStatuses: [200],
      signal: options.signal,
    });
    return normalizeRunnerScaleSet(parseJsonResponse<RunnerScaleSet>(result, 'PATCH', url)) as RunnerScaleSet;
  }

  async deleteRunnerScaleSet(runnerScaleSetId: number, options: ScaleSetRequestOptions = {}): Promise<void> {
    await this.actionsRequest('DELETE', `/${SCALE_SET_ENDPOINT}/${runnerScaleSetId}`, {
      expectedStatuses: [204],
      signal: options.signal,
    });
  }

  async generateJitRunnerConfig(
    setting: RunnerScaleSetJitRunnerSetting,
    runnerScaleSetId: number,
    options: ScaleSetRequestOptions = {},
  ): Promise<RunnerScaleSetJitRunnerConfig> {
    const path = `/${SCALE_SET_ENDPOINT}/${runnerScaleSetId}/generatejitconfig`;
    const { result, url } = await this.actionsRequest('POST', path, {
      body: setting,
      expectedStatuses: [200],
      signal: options.signal,
    });
    return parseJsonResponse<RunnerScaleSetJitRunnerConfig>(result, 'POST', url);
  }

  async getRunner(runnerId: number, options: ScaleSetRequestOptions = {}): Promise<RunnerReference> {
    const path = `/${RUNNER_ENDPOINT}/${runnerId}`;
    const { result, url } = await this.actionsRequest('GET', path, {
      expectedStatuses: [200],
      signal: options.signal,
    });
    return parseJsonResponse<RunnerReference>(result, 'GET', url);
  }

  async getRunnerByName(runnerName: string, options: ScaleSetRequestOptions = {}): Promise<RunnerReference | null> {
    const { result, url } = await this.actionsRequest('GET', RUNNER_ENDPOINT, {
      expectedStatuses: [200],
      query: { agentName: runnerName },
      signal: options.signal,
    });
    const list = parseJsonResponse<RunnerReferenceListResponse>(result, 'GET', url);

    if (list.count === 0) {
      return null;
    }
    if (list.count !== 1) {
      throw new ScaleSetProtocolError(`multiple runners found with name ${JSON.stringify(runnerName)}`);
    }
    if (list.value.length === 0) {
      throw new ScaleSetProtocolError('runner response count was 1 but value was empty');
    }
    return list.value[0];
  }

  async removeRunner(runnerId: number, options: ScaleSetRequestOptions = {}): Promise<void> {
    await this.actionsRequest('DELETE', `/${RUNNER_ENDPOINT}/${runnerId}`, {
      expectedStatuses: [204],
      signal: options.signal,
    });
  }

  async createMessageSessionClient(
    runnerScaleSetId: number,
    owner: string,
    options: ScaleSetRequestOptions = {},
  ): Promise<MessageSessionClient> {
    return MessageSessionClient.create({
      runnerScaleSetId,
      owner,
      fetchImplementation: this.fetchImplementation,
      userAgent: () => this.currentUserAgent,
      actionsRequest: (method, path, requestOptions) => this.actionsRequest(method, path, requestOptions),
      signal: options.signal,
    });
  }

  /** Alias matching the upstream Go client's factory name. */
  async messageSessionClient(
    runnerScaleSetId: number,
    owner: string,
    options: ScaleSetRequestOptions = {},
  ): Promise<MessageSessionClient> {
    return this.createMessageSessionClient(runnerScaleSetId, owner, options);
  }

  private async actionsRequest(
    method: string,
    path: string,
    options: ActionsRequestOptions,
  ): Promise<{ result: HttpResult; url: URL }> {
    const adminToken = await this.getAdminToken(options.signal);
    const url = actionsServiceUrl(adminToken.url, path, options.query);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: options.authorization ?? `Bearer ${adminToken.token}`,
      'User-Agent': this.currentUserAgent,
    };
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    const result = await executeRequest(
      this.fetchImplementation,
      url,
      {
        method,
        headers,
        body,
        signal: options.signal,
      },
      options.expectedStatuses,
    );
    return { result, url };
  }

  private async getAdminToken(signal?: AbortSignal): Promise<ActionsServiceAdminToken> {
    if (this.adminTokenIsUsable(this.adminToken)) {
      return this.adminToken;
    }

    if (this.adminTokenRefresh === undefined) {
      this.adminTokenRefresh = this.refreshAdminToken(signal).finally(() => {
        this.adminTokenRefresh = undefined;
      });
    }
    return this.adminTokenRefresh;
  }

  private adminTokenIsUsable(token?: ActionsServiceAdminToken): token is ActionsServiceAdminToken {
    return token !== undefined && this.now().getTime() + ADMIN_TOKEN_REFRESH_SKEW_MS < token.expiresAt.getTime();
  }

  private async refreshAdminToken(signal?: AbortSignal): Promise<ActionsServiceAdminToken> {
    const registrationToken = await this.getRunnerRegistrationToken(signal);
    const adminConnection = await this.getActionsServiceAdminConnection(registrationToken, signal);
    const refreshedToken: ActionsServiceAdminToken = {
      token: adminConnection.token,
      expiresAt: parseJwtExpiration(adminConnection.token),
      url: adminConnection.url,
    };
    this.adminToken = refreshedToken;
    return refreshedToken;
  }

  private async getRunnerRegistrationToken(signal?: AbortSignal): Promise<string> {
    const providedToken = await this.accessTokenProvider();
    const accessToken = typeof providedToken === 'string' ? providedToken : providedToken.token;
    if (accessToken === '') {
      throw new ScaleSetProtocolError('access token provider returned an empty token');
    }

    const url = githubApiUrl(this.config, runnerRegistrationTokenPath(this.config));
    const result = await executeRequest(
      this.fetchImplementation,
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/vnd.github.v3+json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': this.currentUserAgent,
        },
        body: '',
        signal,
      },
      [201],
    );
    const response = parseJsonResponse<RegistrationTokenResponse>(result, 'POST', url);
    if (!response.token) {
      throw new ScaleSetProtocolError('runner registration token response is missing token');
    }
    return response.token;
  }

  private async getActionsServiceAdminConnection(
    registrationToken: string,
    signal?: AbortSignal,
  ): Promise<{ url: string; token: string }> {
    const url = githubApiUrl(this.config, '/actions/runner-registration');
    const result = await executeRequest(
      this.adminConnectionFetchImplementation,
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `RemoteAuth ${registrationToken}`,
          'User-Agent': this.currentUserAgent,
        },
        body: JSON.stringify({
          url: this.config.configUrl.toString(),
          runner_event: 'register',
        }),
        signal,
      },
      SUCCESS_STATUSES,
    );
    const response = parseJsonResponse<ActionsServiceAdminConnectionResponse>(result, 'POST', url);
    if (!response.url) {
      throw new ScaleSetProtocolError('Actions service admin connection is missing url');
    }
    if (!response.token) {
      throw new ScaleSetProtocolError('Actions service admin connection is missing token');
    }
    return { url: response.url, token: response.token };
  }
}

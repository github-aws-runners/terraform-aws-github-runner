import { createAppAuth } from '@octokit/auth-app';
import { StrategyOptions } from '@octokit/auth-app/dist-types/types';
import { request } from '@octokit/request';
import { RequestInterface, RequestParameters } from '@octokit/types';
import { createCommonStorage, type GitHubAppCredentialsStore } from '@aws-github-runner/storage-providers';
import { generateKeyPairSync } from 'node:crypto';
import * as nock from 'nock';

import {
  createGithubAppAuth,
  createOctokitClient,
  getStoredInstallationId,
  hasAlternativeAppWithHeadroom,
  isGitHubRateLimitError,
  onRateLimit,
  onSecondaryRateLimit,
  reportAppRateLimit,
  reportAppSecondaryRateLimit,
  resetAppCredentialsCache,
} from './auth';
import { describe, it, expect, beforeEach, vi } from 'vitest';

type MockProxy<T> = T & {
  mockImplementation: (fn: (...args: T[]) => T) => MockProxy<T>;
  mockResolvedValue: (value: T) => MockProxy<T>;
  mockRejectedValue: (value: T) => MockProxy<T>;
  mockReturnValue: (value: T) => MockProxy<T>;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mock = <T>(implementation?: any): MockProxy<T> => vi.fn(implementation) as any;

vi.mock('@aws-github-runner/storage-providers', () => ({
  createCommonStorage: vi.fn(),
}));
vi.mock('@octokit/auth-app');

const cleanEnv = process.env;
const GITHUB_APP_ID = 1;
const mockedCreateCommonStorage = vi.mocked(createCommonStorage);
const mockedGetCredentials = vi.fn<GitHubAppCredentialsStore['get']>();
const credentialsStore = { get: mockedGetCredentials } satisfies GitHubAppCredentialsStore;
const defaultCredentials = [{ appId: GITHUB_APP_ID, privateKey: 'private-key' }];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  resetAppCredentialsCache();
  process.env = { ...cleanEnv };
  mockedGetCredentials.mockResolvedValue(defaultCredentials);
  mockedCreateCommonStorage.mockReturnValue({ githubAppCredentials: credentialsStore });
  nock.disableNetConnect();
});

describe('Test createOctoClient', () => {
  it('Creates app client to GitHub public', async () => {
    // Arrange
    const token = '123456';

    // Act
    const result = await createOctokitClient(token);

    // Assert
    expect(result.request.endpoint.DEFAULTS.baseUrl).toBe('https://api.github.com');
  });

  it('Creates app client to GitHub ES', async () => {
    // Arrange
    const enterpriseServer = 'https://github.enterprise.notgoingtowork';
    const token = '123456';

    // Act
    const result = await createOctokitClient(token, enterpriseServer);

    // Assert
    expect(result.request.endpoint.DEFAULTS.baseUrl).toBe(enterpriseServer);
    expect(result.request.endpoint.DEFAULTS.mediaType.previews).toStrictEqual(['antiope']);
  });
});

describe('Test createGithubAppAuth', () => {
  const mockedCreatAppAuth = vi.mocked(createAppAuth);
  let mockedRequestInterface: MockProxy<RequestInterface>;

  const installationId = 1;
  const authType = 'app';
  const token = '123456';
  const decryptedValue = 'decryptedValue';

  it('Creates auth object with createJwt callback including jti claim', async () => {
    // Arrange
    mockedGetCredentials.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: decryptedValue }]);

    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    mockedCreatAppAuth.mockReturnValue(mockWithHook);

    // Act
    await createGithubAppAuth(installationId);

    // Assert
    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    const callArgs = mockedCreatAppAuth.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.appId).toBe(GITHUB_APP_ID);
    expect(callArgs.createJwt).toBeTypeOf('function');
    expect(callArgs).not.toHaveProperty('privateKey');
    expect(callArgs.installationId).toBe(installationId);
  });

  it('createJwt callback produces unique JWTs with jti', async () => {
    // Arrange — need a real RSA key since createJwt actually signs
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    mockedGetCredentials.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: privateKey as string }]);

    let capturedCreateJwt: (appId: string | number, timeDifference?: number) => Promise<{ jwt: string }>;
    mockedCreatAppAuth.mockImplementation((opts: StrategyOptions) => {
      capturedCreateJwt = (opts as Record<string, unknown>).createJwt as typeof capturedCreateJwt;
      const mockedAuth = vi.fn().mockResolvedValue({ token });
      return Object.assign(mockedAuth, { hook: vi.fn() });
    });

    // Act
    await createGithubAppAuth(installationId);

    // Generate two JWTs and verify they are different (jti makes them unique)
    const jwt1 = await capturedCreateJwt!(1);
    const jwt2 = await capturedCreateJwt!(1);

    // Assert — JWTs must differ even when generated in the same second
    expect(jwt1.jwt).not.toBe(jwt2.jwt);

    // Verify JWT structure: header.payload.signature
    const parts = jwt1.jwt.split('.');
    expect(parts).toHaveLength(3);
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(payload).toHaveProperty('jti');
    expect(payload).toHaveProperty('iat');
    expect(payload).toHaveProperty('exp');
    expect(payload).toHaveProperty('iss');
  });

  it('Creates auth object with line breaks in SSH key.', async () => {
    // Arrange
    const privateKeyWithLineBreaks = decryptedValue + '\n' + decryptedValue;
    mockedGetCredentials.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: privateKeyWithLineBreaks }]);

    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    mockedCreatAppAuth.mockReturnValue(mockWithHook);

    // Act
    const result = await createGithubAppAuth(installationId);

    // Assert
    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    expect(mockedAuth).toBeCalledWith({ type: authType });
    expect(result.token).toBe(token);
  });

  it('Creates auth object for public GitHub', async () => {
    // Arrange
    mockedGetCredentials.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: decryptedValue }]);

    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    mockedCreatAppAuth.mockReturnValue(mockWithHook);

    // Act
    const result = await createGithubAppAuth(installationId);

    // Assert
    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    const callArgs = mockedCreatAppAuth.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.appId).toBe(GITHUB_APP_ID);
    expect(callArgs.createJwt).toBeTypeOf('function');
    expect(callArgs.installationId).toBe(installationId);
    expect(mockedAuth).toBeCalledWith({ type: authType });
    expect(result.token).toBe(token);
  });

  it('Creates auth object for Enterprise Server', async () => {
    // Arrange
    const githubServerUrl = 'https://github.enterprise.notgoingtowork';

    mockedRequestInterface = mock<RequestInterface>();
    vi.spyOn(request, 'defaults').mockImplementation(
      () => mockedRequestInterface as RequestInterface<object & RequestParameters>,
    );

    mockedGetCredentials.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: decryptedValue }]);
    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mockedCreatAppAuth.mockImplementation((authOptions: StrategyOptions) => {
      return Object.assign(mockedAuth, { hook: vi.fn() });
    });

    // Act
    const result = await createGithubAppAuth(installationId, githubServerUrl);

    // Assert
    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    const callArgs = mockedCreatAppAuth.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.appId).toBe(GITHUB_APP_ID);
    expect(callArgs.createJwt).toBeTypeOf('function');
    expect(callArgs.installationId).toBe(installationId);
    expect(callArgs.request).toBeDefined();
    expect(mockedAuth).toBeCalledWith({ type: authType });
    expect(result.token).toBe(token);
  });

  it('Creates auth object for Enterprise Server with no ID', async () => {
    // Arrange
    const githubServerUrl = 'https://github.enterprise.notgoingtowork';

    mockedRequestInterface = mock<RequestInterface>();
    vi.spyOn(request, 'defaults').mockImplementation(
      () => mockedRequestInterface as RequestInterface<object & RequestParameters>,
    );

    const installationId = undefined;

    mockedGetCredentials.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: decryptedValue }]);
    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    mockedCreatAppAuth.mockReturnValue(mockWithHook);

    // Act
    const result = await createGithubAppAuth(installationId, githubServerUrl);

    // Assert
    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    const callArgs = mockedCreatAppAuth.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.appId).toBe(GITHUB_APP_ID);
    expect(callArgs.createJwt).toBeTypeOf('function');
    expect(callArgs).not.toHaveProperty('installationId');
    expect(callArgs.request).toBeDefined();
    expect(mockedAuth).toBeCalledWith({ type: authType });
    expect(result.token).toBe(token);
  });
});

describe('Test throttling retry caps', () => {
  // The plugin passes retryCount as the 4th argument and uses the boolean return
  // value to decide whether to retry (see @octokit/plugin-throttling wrap-request).
  const options = { method: 'GET', url: '/repos/o/r' } as never;
  const octokit = {} as never;

  it.each([
    [0, true],
    [1, true],
    [2, false],
    [3, false],
  ])('onRateLimit retries at retryCount=%i -> %s', (retryCount, expected) => {
    expect(onRateLimit(60, options, octokit, retryCount)).toBe(expected);
  });

  it.each([
    [0, true],
    [1, false],
    [2, false],
  ])('onSecondaryRateLimit retries at retryCount=%i -> %s', (retryCount, expected) => {
    expect(onSecondaryRateLimit(60, options, octokit, retryCount)).toBe(expected);
  });
});

describe('Test getStoredInstallationId', () => {
  it('returns stored installation ID for an additional app', async () => {
    mockedGetCredentials.mockResolvedValueOnce([
      { appId: GITHUB_APP_ID, privateKey: 'private-key' },
      { appId: 2, privateKey: 'additional-private-key', installationId: 12345 },
    ]);

    await expect(getStoredInstallationId(1)).resolves.toBe(12345);
  });

  it('returns undefined when a credential has no stored installation ID', async () => {
    await expect(getStoredInstallationId(0)).resolves.toBeUndefined();
  });

  it('returns undefined for an out-of-bounds app index', async () => {
    await expect(getStoredInstallationId(99)).resolves.toBeUndefined();
  });

  it('loads installation IDs for multiple credentials in order', async () => {
    mockedGetCredentials.mockResolvedValueOnce([
      { appId: GITHUB_APP_ID, privateKey: 'private-key' },
      { appId: 2, privateKey: 'additional-private-key', installationId: 67890 },
    ]);

    await expect(getStoredInstallationId(0)).resolves.toBeUndefined();
    await expect(getStoredInstallationId(1)).resolves.toBe(67890);
  });
});

describe('Test rate-limit aware app selection', () => {
  beforeEach(() => {
    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token: 'token' });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    vi.mocked(createAppAuth).mockReturnValue(mockWithHook);

    mockedGetCredentials.mockResolvedValue([
      { appId: GITHUB_APP_ID, privateKey: 'private-key' },
      { appId: 2, privateKey: 'additional-private-key' },
    ]);

    // Pin the random start offset to 0 so selection is deterministic.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('selects the app with the most rate limit budget remaining', async () => {
    reportAppRateLimit(0, 100);
    reportAppRateLimit(1, 5000);

    const result = await createGithubAppAuth(undefined);
    expect(result.appIndex).toBe(1);
  });

  it('selects from the supplied credentials store without reading the default store', async () => {
    const suppliedCredentialsStore = {
      get: vi.fn().mockResolvedValue([
        { appId: 10, privateKey: 'first-key' },
        { appId: 20, privateKey: 'second-key' },
      ]),
    };
    reportAppRateLimit(0, 100);
    reportAppRateLimit(1, 5000);

    const result = await createGithubAppAuth(undefined, '', undefined, suppliedCredentialsStore);

    expect(result.appIndex).toBe(1);
    expect(createAppAuth).toHaveBeenCalledWith(expect.objectContaining({ appId: 20, createJwt: expect.any(Function) }));
    expect(mockedGetCredentials).not.toHaveBeenCalled();
  });

  it('assumes full budget for apps without observed state', async () => {
    reportAppRateLimit(0, 100);

    const result = await createGithubAppAuth(undefined);
    expect(result.appIndex).toBe(1);
  });

  it('skips an app cooling down after a secondary rate limit', async () => {
    reportAppRateLimit(0, 100);
    reportAppRateLimit(1, 5000);
    reportAppSecondaryRateLimit(1);

    const result = await createGithubAppAuth(undefined);
    expect(result.appIndex).toBe(0);
  });

  it('falls back to the most budget when every app is cooling down', async () => {
    reportAppRateLimit(0, 100);
    reportAppRateLimit(1, 5000);
    reportAppSecondaryRateLimit(0);
    reportAppSecondaryRateLimit(1);

    const result = await createGithubAppAuth(undefined);
    expect(result.appIndex).toBe(1);
  });

  it('short-circuits to the primary app in single-app deployments', async () => {
    mockedGetCredentials.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: 'private-key' }]);
    reportAppRateLimit(0, 0);

    const result = await createGithubAppAuth(undefined);
    expect(result.appIndex).toBe(0);
  });

  it('respects an explicitly provided app index', async () => {
    reportAppRateLimit(0, 5000);
    reportAppRateLimit(1, 100);

    const result = await createGithubAppAuth(undefined, '', 1);
    expect(result.appIndex).toBe(1);
  });

  it('excludes the given app index from selection, e.g. one that just got rate-limited', async () => {
    reportAppRateLimit(0, 5000);
    reportAppRateLimit(1, 100);

    const result = await createGithubAppAuth(undefined, '', undefined, undefined, 0);
    expect(result.appIndex).toBe(1);
  });

  it('falls back to the excluded app when it is the only one configured', async () => {
    delete process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME;

    const result = await createGithubAppAuth(undefined, '', undefined, undefined, 0);
    expect(result.appIndex).toBe(0);
  });
});

describe('Test app selection with 3+ apps (multi-app failover)', () => {
  const decryptedValue = 'decryptedValue';
  const b64 = Buffer.from(decryptedValue, 'binary').toString('base64');
  const app2IdParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_id`;
  const app2KeyParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_key_base64`;
  const app3IdParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_1_id`;
  const app3KeyParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_1_key_base64`;

  beforeEach(() => {
    const mockedAuth = vi.fn().mockResolvedValue({ token: 'token' });
    vi.mocked(createAppAuth).mockReturnValue(Object.assign(mockedAuth, { hook: vi.fn() }));

    process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME = `/actions-runner/${ENVIRONMENT}/additional_github_apps_manifest`;
    mockedGetParameter.mockResolvedValue(
      JSON.stringify([
        { idParamName: app2IdParam, keyParamName: app2KeyParam },
        { idParamName: app3IdParam, keyParamName: app3KeyParam },
      ]),
    );
    mockedGetParameters.mockResolvedValue(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64],
        [app2IdParam, '2'],
        [app2KeyParam, b64],
        [app3IdParam, '3'],
        [app3KeyParam, b64],
      ]),
    );
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('excludes every already-tried app, not just the most recent one, when given an array', async () => {
    reportAppRateLimit(0, 5000);
    reportAppRateLimit(1, 4000);
    reportAppRateLimit(2, 3000);

    const result = await createGithubAppAuth(undefined, '', undefined, undefined, [0, 1]);
    expect(result.appIndex).toBe(2);
  });

  it('hasAlternativeAppWithHeadroom finds the third app once the first two are excluded', async () => {
    await createGithubAppAuth(undefined); // populate the credentials cache
    reportAppRateLimit(0, 0);
    reportAppRateLimit(1, 0);
    reportAppRateLimit(2, 100);

    expect(hasAlternativeAppWithHeadroom(0)).toBe(true); // apps 1/2 still uninspected in this call
    expect(hasAlternativeAppWithHeadroom([0, 1])).toBe(true); // app 2 still has budget
    expect(hasAlternativeAppWithHeadroom([0, 1, 2])).toBe(false); // nothing left to try
  });
});

describe('Test hasAlternativeAppWithHeadroom', () => {
  const decryptedValue = 'decryptedValue';
  const b64 = Buffer.from(decryptedValue, 'binary').toString('base64');
  const app2IdParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_id`;
  const app2KeyParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_key_base64`;

  beforeEach(async () => {
    const mockedAuth = vi.fn().mockResolvedValue({ token: 'token' });
    vi.mocked(createAppAuth).mockReturnValue(Object.assign(mockedAuth, { hook: vi.fn() }));

    process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME = `/actions-runner/${ENVIRONMENT}/additional_github_apps_manifest`;
    mockedGetParameter.mockResolvedValue(JSON.stringify([{ idParamName: app2IdParam, keyParamName: app2KeyParam }]));
    mockedGetParameters.mockResolvedValue(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64],
        [app2IdParam, '2'],
        [app2KeyParam, b64],
      ]),
    );
    // Populates the credentials cache that the sync check reads.
    await createGithubAppAuth(undefined);
  });

  it('returns false before any credentials have been loaded', () => {
    resetAppCredentialsCache();
    expect(hasAlternativeAppWithHeadroom(0)).toBe(false);
  });

  it('returns true when another app has remaining budget', () => {
    reportAppRateLimit(1, 100);
    expect(hasAlternativeAppWithHeadroom(0)).toBe(true);
  });

  it('returns false when the only other app is exhausted', () => {
    reportAppRateLimit(1, 0);
    expect(hasAlternativeAppWithHeadroom(0)).toBe(false);
  });

  it('returns false when the only other app is cooling down from a secondary rate limit', () => {
    reportAppRateLimit(1, 100);
    reportAppSecondaryRateLimit(1);
    expect(hasAlternativeAppWithHeadroom(0)).toBe(false);
  });

  it('returns false in a single-app deployment', async () => {
    resetAppCredentialsCache();
    delete process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME;
    await createGithubAppAuth(undefined);

    expect(hasAlternativeAppWithHeadroom(0)).toBe(false);
  });
});

describe('Test isGitHubRateLimitError', () => {
  it.each([
    [
      'a 403 with x-ratelimit-remaining: 0',
      { status: 403, response: { headers: { 'x-ratelimit-remaining': '0' } } },
      true,
    ],
    ['a 429 with a rate limit message', { status: 429, message: 'You have exceeded a secondary rate limit' }, true],
    ['a 403 that is a plain permission error', { status: 403, response: { headers: {} } }, false],
    ['a 404', { status: 404 }, false],
    ['a non-error value', 'not an error', false],
    ['null', null, false],
  ])('%s -> %s', (_description, error, expected) => {
    expect(isGitHubRateLimitError(error)).toBe(expected);
  });
});

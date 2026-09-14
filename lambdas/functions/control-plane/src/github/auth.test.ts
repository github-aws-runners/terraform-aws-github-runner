import { createAppAuth } from '@octokit/auth-app';
import { StrategyOptions } from '@octokit/auth-app/dist-types/types';
import { request } from '@octokit/request';
import { RequestInterface, RequestParameters } from '@octokit/types';
import { getParameter, getParameters } from '@aws-github-runner/aws-ssm-util';
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

vi.mock('@aws-github-runner/aws-ssm-util');
vi.mock('@octokit/auth-app');

const cleanEnv = process.env;
const ENVIRONMENT = 'dev';
const GITHUB_APP_ID = '1';
const PARAMETER_GITHUB_APP_ID_NAME = `/actions-runner/${ENVIRONMENT}/github_app_id`;
const PARAMETER_GITHUB_APP_KEY_BASE64_NAME = `/actions-runner/${ENVIRONMENT}/github_app_key_base64`;

const mockedGetParameters = vi.mocked(getParameters);
const mockedGetParameter = vi.mocked(getParameter);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  resetAppCredentialsCache();
  process.env = { ...cleanEnv };
  process.env.PARAMETER_GITHUB_APP_ID_NAME = PARAMETER_GITHUB_APP_ID_NAME;
  process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME = PARAMETER_GITHUB_APP_KEY_BASE64_NAME;
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
  const b64 = Buffer.from(decryptedValue, 'binary').toString('base64');

  beforeEach(() => {
    process.env.ENVIRONMENT = ENVIRONMENT;
  });

  it('Throws early when PARAMETER_GITHUB_APP_ID_NAME is not set', async () => {
    delete process.env.PARAMETER_GITHUB_APP_ID_NAME;

    await expect(createGithubAppAuth(installationId)).rejects.toThrow(
      'Environment variable PARAMETER_GITHUB_APP_ID_NAME is not set',
    );
    expect(mockedGetParameters).not.toHaveBeenCalled();
  });

  it('Throws early when PARAMETER_GITHUB_APP_KEY_BASE64_NAME is not set', async () => {
    delete process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME;

    await expect(createGithubAppAuth(installationId)).rejects.toThrow(
      'Environment variable PARAMETER_GITHUB_APP_KEY_BASE64_NAME is not set',
    );
    expect(mockedGetParameters).not.toHaveBeenCalled();
  });

  it('Creates auth object with createJwt callback including jti claim', async () => {
    // Arrange
    mockedGetParameters.mockResolvedValueOnce(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64],
      ]),
    );

    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    mockedCreatAppAuth.mockReturnValue(mockWithHook);

    // Act
    await createGithubAppAuth(installationId);

    // Assert
    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    const callArgs = mockedCreatAppAuth.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.appId).toBe(parseInt(GITHUB_APP_ID));
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
    const b64Key = Buffer.from(privateKey as string).toString('base64');

    mockedGetParameters.mockResolvedValueOnce(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64Key],
      ]),
    );

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
    const b64PrivateKeyWithLineBreaks = Buffer.from(decryptedValue + '\n' + decryptedValue, 'binary').toString(
      'base64',
    );
    mockedGetParameters.mockResolvedValueOnce(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64PrivateKeyWithLineBreaks],
      ]),
    );

    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    mockedCreatAppAuth.mockReturnValue(mockWithHook);

    // Act
    const result = await createGithubAppAuth(installationId);

    // Assert
    expect(getParameters).toBeCalledWith([PARAMETER_GITHUB_APP_ID_NAME, PARAMETER_GITHUB_APP_KEY_BASE64_NAME]);
    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    expect(mockedAuth).toBeCalledWith({ type: authType });
    expect(result.token).toBe(token);
  });

  it('Creates auth object for public GitHub', async () => {
    // Arrange
    mockedGetParameters.mockResolvedValueOnce(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64],
      ]),
    );

    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    mockedCreatAppAuth.mockReturnValue(mockWithHook);

    // Act
    const result = await createGithubAppAuth(installationId);

    // Assert
    expect(getParameters).toBeCalledWith([PARAMETER_GITHUB_APP_ID_NAME, PARAMETER_GITHUB_APP_KEY_BASE64_NAME]);

    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    const callArgs = mockedCreatAppAuth.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.appId).toBe(parseInt(GITHUB_APP_ID));
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

    mockedGetParameters.mockResolvedValueOnce(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64],
      ]),
    );
    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mockedCreatAppAuth.mockImplementation((authOptions: StrategyOptions) => {
      return Object.assign(mockedAuth, { hook: vi.fn() });
    });

    // Act
    const result = await createGithubAppAuth(installationId, githubServerUrl);

    // Assert
    expect(getParameters).toBeCalledWith([PARAMETER_GITHUB_APP_ID_NAME, PARAMETER_GITHUB_APP_KEY_BASE64_NAME]);

    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    const callArgs = mockedCreatAppAuth.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.appId).toBe(parseInt(GITHUB_APP_ID));
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

    mockedGetParameters.mockResolvedValueOnce(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64],
      ]),
    );
    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    mockedCreatAppAuth.mockReturnValue(mockWithHook);

    // Act
    const result = await createGithubAppAuth(installationId, githubServerUrl);

    // Assert
    expect(getParameters).toBeCalledWith([PARAMETER_GITHUB_APP_ID_NAME, PARAMETER_GITHUB_APP_KEY_BASE64_NAME]);

    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    const callArgs = mockedCreatAppAuth.mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs.appId).toBe(parseInt(GITHUB_APP_ID));
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
  const decryptedValue = 'decryptedValue';
  const b64 = Buffer.from(decryptedValue, 'binary').toString('base64');

  beforeEach(() => {
    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token: 'token' });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    vi.mocked(createAppAuth).mockReturnValue(mockWithHook);
  });

  it('returns stored installation ID when configured for an additional app', async () => {
    const appIdParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_id`;
    const appKeyParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_key_base64`;
    const installationIdParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_installation_id`;
    process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME = `/actions-runner/${ENVIRONMENT}/additional_github_apps_manifest`;
    mockedGetParameter.mockResolvedValueOnce(
      JSON.stringify([
        { idParamName: appIdParam, keyParamName: appKeyParam, installationIdParamName: installationIdParam },
      ]),
    );
    mockedGetParameters.mockResolvedValueOnce(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64],
        [appIdParam, '2'],
        [appKeyParam, b64],
        [installationIdParam, '12345'],
      ]),
    );

    const result = await getStoredInstallationId(1);
    expect(result).toBe(12345);
  });

  it('returns undefined when the manifest env var is empty', async () => {
    process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME = '';
    mockedGetParameters.mockResolvedValueOnce(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64],
      ]),
    );

    const result = await getStoredInstallationId(0);
    expect(result).toBeUndefined();
  });

  it('returns undefined when the manifest env var is not set', async () => {
    delete process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME;
    mockedGetParameters.mockResolvedValueOnce(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64],
      ]),
    );

    const result = await getStoredInstallationId(0);
    expect(result).toBeUndefined();
  });

  it('returns undefined for out-of-bounds appIndex', async () => {
    delete process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME;
    mockedGetParameters.mockResolvedValueOnce(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, GITHUB_APP_ID],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64],
      ]),
    );

    const result = await getStoredInstallationId(99);
    expect(result).toBeUndefined();
  });

  it('loads installation IDs for multi-app setup from the manifest', async () => {
    const app2IdParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_id`;
    const app2KeyParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_key_base64`;
    const app2InstallParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_installation_id`;

    process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME = `/actions-runner/${ENVIRONMENT}/additional_github_apps_manifest`;
    mockedGetParameter.mockResolvedValueOnce(
      JSON.stringify([
        { idParamName: app2IdParam, keyParamName: app2KeyParam, installationIdParamName: app2InstallParam },
      ]),
    );
    mockedGetParameters.mockResolvedValueOnce(
      new Map([
        [PARAMETER_GITHUB_APP_ID_NAME, '1'],
        [PARAMETER_GITHUB_APP_KEY_BASE64_NAME, b64],
        [app2IdParam, '2'],
        [app2KeyParam, b64],
        [app2InstallParam, '67890'],
      ]),
    );

    // Primary app (index 0) has no stored installation ID
    const result0 = await getStoredInstallationId(0);
    expect(result0).toBeUndefined();

    // Additional app (index 1) has stored installation ID
    const result1 = await getStoredInstallationId(1);
    expect(result1).toBe(67890);
  });
});

describe('Test rate-limit aware app selection', () => {
  const decryptedValue = 'decryptedValue';
  const b64 = Buffer.from(decryptedValue, 'binary').toString('base64');
  const app2IdParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_id`;
  const app2KeyParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_key_base64`;

  beforeEach(() => {
    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token: 'token' });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    vi.mocked(createAppAuth).mockReturnValue(mockWithHook);

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

    // Pin the random start offset to 0 so selection is deterministic.
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  it('selects the app with the most rate limit budget remaining', async () => {
    reportAppRateLimit(0, 100);
    reportAppRateLimit(1, 5000);

    const result = await createGithubAppAuth(undefined);
    expect(result.appIndex).toBe(1);
  });

  it('selects from the supplied credentials store without reading SSM', async () => {
    const credentialsStore = {
      get: vi.fn().mockResolvedValue([
        { appId: 10, privateKey: 'first-key' },
        { appId: 20, privateKey: 'second-key' },
      ]),
    };
    reportAppRateLimit(0, 100);
    reportAppRateLimit(1, 5000);

    const result = await createGithubAppAuth(undefined, '', undefined, credentialsStore);

    expect(result.appIndex).toBe(1);
    expect(createAppAuth).toHaveBeenCalledWith(expect.objectContaining({ appId: 20, createJwt: expect.any(Function) }));
    expect(mockedGetParameter).not.toHaveBeenCalled();
    expect(mockedGetParameters).not.toHaveBeenCalled();
  });

  it('assumes full budget for apps without observed state', async () => {
    reportAppRateLimit(0, 100);
    // App 1 has no observed state and is assumed full.

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
    delete process.env.PARAMETER_GITHUB_APPS_MANIFEST_NAME;
    reportAppRateLimit(0, 0);

    const result = await createGithubAppAuth(undefined);
    expect(result.appIndex).toBe(0);
  });

  it('respects an explicitly provided appIndex', async () => {
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

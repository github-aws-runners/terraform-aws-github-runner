import { createAppAuth } from '@octokit/auth-app';
import { StrategyOptions } from '@octokit/auth-app/dist-types/types';
import { request } from '@octokit/request';
import { RequestInterface, RequestParameters } from '@octokit/types';
import {
  getGitHubAppCredentialsStore,
  type GitHubAppCredential,
  type GitHubAppCredentialsStore,
} from '@aws-github-runner/storage-providers';
import { generateKeyPairSync } from 'node:crypto';
import * as nock from 'nock';

import {
  createGithubAppAuth,
  createOctokitClient,
  getAppCount,
  getAppId,
  getStoredInstallationId,
  onRateLimit,
  onSecondaryRateLimit,
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
  getGitHubAppCredentialsStore: vi.fn(),
}));
vi.mock('@octokit/auth-app');

const cleanEnv = process.env;
const GITHUB_APP_ID = 1;

const mockedGetGitHubAppCredentialsStore = vi.mocked(getGitHubAppCredentialsStore);
const mockCredentialsGet = vi.fn<GitHubAppCredentialsStore['get']>();
const credentialsStore = {
  get: mockCredentialsGet,
} satisfies GitHubAppCredentialsStore;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockCredentialsGet.mockReset();
  resetAppCredentialsCache();
  process.env = { ...cleanEnv };
  mockedGetGitHubAppCredentialsStore.mockReturnValue(credentialsStore);
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

  it('Propagates errors from the credential store', async () => {
    const error = new Error('Unable to load GitHub App credentials');
    mockCredentialsGet.mockRejectedValueOnce(error);

    await expect(createGithubAppAuth(installationId)).rejects.toBe(error);
    expect(mockCredentialsGet).toHaveBeenCalledOnce();
  });

  it('Creates auth object with createJwt callback including jti claim', async () => {
    // Arrange
    mockCredentialsGet.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: decryptedValue }]);

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
    mockCredentialsGet.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: privateKey as string }]);

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

  it('Creates auth object for public GitHub', async () => {
    // Arrange
    mockCredentialsGet.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: decryptedValue }]);

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

    mockCredentialsGet.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: decryptedValue }]);
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

    mockCredentialsGet.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: decryptedValue }]);
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

describe('Test GitHub App credential accessors', () => {
  it('returns stored installation ID when configured', async () => {
    mockCredentialsGet.mockResolvedValueOnce([
      { appId: GITHUB_APP_ID, privateKey: 'private-key', installationId: 12345 },
    ]);

    const result = await getStoredInstallationId(0);
    expect(result).toBe(12345);
  });

  it('returns undefined when the credential has no installation ID', async () => {
    mockCredentialsGet.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: 'private-key' }]);

    const result = await getStoredInstallationId(0);
    expect(result).toBeUndefined();
  });

  it('returns undefined for out-of-bounds appIndex', async () => {
    mockCredentialsGet.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: 'private-key' }]);

    const result = await getStoredInstallationId(99);
    expect(result).toBeUndefined();
  });

  it('loads multi-app credentials once and exposes values by index', async () => {
    const credentials: GitHubAppCredential[] = [
      { appId: 1, privateKey: 'private-key-1' },
      { appId: 2, privateKey: 'private-key-2', installationId: 67890 },
    ];
    mockCredentialsGet.mockResolvedValueOnce(credentials);

    await expect(getAppCount()).resolves.toBe(2);
    await expect(getAppId()).resolves.toBe('1');
    await expect(getAppId(1)).resolves.toBe('2');
    await expect(getStoredInstallationId(0)).resolves.toBeUndefined();
    await expect(getStoredInstallationId(1)).resolves.toBe(67890);
    expect(mockCredentialsGet).toHaveBeenCalledOnce();
  });

  it('throws a clear error for an out-of-bounds app ID index', async () => {
    mockCredentialsGet.mockResolvedValueOnce([{ appId: GITHUB_APP_ID, privateKey: 'private-key' }]);

    await expect(getAppId(99)).rejects.toThrow('GitHub App credential at index 99 not found');
  });
});

import { createAppAuth } from '@octokit/auth-app';
import { StrategyOptions } from '@octokit/auth-app/dist-types/types';
import { request } from '@octokit/request';
import { RequestInterface, RequestParameters } from '@octokit/types';
import { getParameters } from '@aws-github-runner/aws-ssm-util';
import { generateKeyPairSync } from 'node:crypto';
import * as nock from 'nock';

import { createGithubAppAuth, createOctokitClient, getStoredInstallationId, resetAppCredentialsCache } from './auth';
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

describe('Test getStoredInstallationId', () => {
  const decryptedValue = 'decryptedValue';
  const b64 = Buffer.from(decryptedValue, 'binary').toString('base64');

  beforeEach(() => {
    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token: 'token' });
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    vi.mocked(createAppAuth).mockReturnValue(mockWithHook);
  });

  it('returns stored installation ID when configured', async () => {
    const installationIdParam = `/actions-runner/${ENVIRONMENT}/github_app_installation_id`;
    process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME = installationIdParam;
    mockedGet.mockResolvedValueOnce(GITHUB_APP_ID).mockResolvedValueOnce(b64).mockResolvedValueOnce('12345');

    const result = await getStoredInstallationId(0);
    expect(result).toBe(12345);
    expect(getParameter).toHaveBeenCalledWith(installationIdParam);
  });

  it('returns undefined when installation ID param is empty', async () => {
    process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME = '';
    mockedGet.mockResolvedValueOnce(GITHUB_APP_ID).mockResolvedValueOnce(b64);

    const result = await getStoredInstallationId(0);
    expect(result).toBeUndefined();
  });

  it('returns undefined when env var is not set', async () => {
    delete process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME;
    mockedGet.mockResolvedValueOnce(GITHUB_APP_ID).mockResolvedValueOnce(b64);

    const result = await getStoredInstallationId(0);
    expect(result).toBeUndefined();
  });

  it('returns undefined for out-of-bounds appIndex', async () => {
    process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME = '';
    mockedGet.mockResolvedValueOnce(GITHUB_APP_ID).mockResolvedValueOnce(b64);

    const result = await getStoredInstallationId(99);
    expect(result).toBeUndefined();
  });

  it('loads installation IDs for multi-app setup', async () => {
    const app1IdParam = `/actions-runner/${ENVIRONMENT}/github_app_id`;
    const app2IdParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_id`;
    const app1KeyParam = `/actions-runner/${ENVIRONMENT}/github_app_key_base64`;
    const app2KeyParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_key_base64`;
    const app2InstallParam = `/actions-runner/${ENVIRONMENT}/additional_github_app_0_installation_id`;

    process.env.PARAMETER_GITHUB_APP_ID_NAME = `${app1IdParam}:${app2IdParam}`;
    process.env.PARAMETER_GITHUB_APP_KEY_BASE64_NAME = `${app1KeyParam}:${app2KeyParam}`;
    process.env.PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME = `:${app2InstallParam}`;

    mockedGet
      .mockResolvedValueOnce('1') // app1 id
      .mockResolvedValueOnce(b64) // app1 key
      .mockResolvedValueOnce('2') // app2 id
      .mockResolvedValueOnce(b64) // app2 key
      .mockResolvedValueOnce('67890'); // app2 installation id

    // Primary app (index 0) has no stored installation ID
    const result0 = await getStoredInstallationId(0);
    expect(result0).toBeUndefined();

    // Additional app (index 1) has stored installation ID
    const result1 = await getStoredInstallationId(1);
    expect(result1).toBe(67890);
  });
});

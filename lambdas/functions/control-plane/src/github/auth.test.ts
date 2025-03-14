import { createAppAuth } from '@octokit/auth-app';
import { StrategyOptions } from '@octokit/auth-app/dist-types/types';
import { request } from '@octokit/request';
import { RequestInterface, RequestParameters } from '@octokit/types';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import * as nock from 'nock';

import { createGithubAppAuth, createOctokitClient } from './auth';
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

const mockedGet = vi.mocked(getParameter);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
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

  it('Creates auth object with line breaks in SSH key.', async () => {
    // Arrange
    const authOptions = {
      appId: parseInt(GITHUB_APP_ID),
      privateKey: `${decryptedValue}
${decryptedValue}`,
      installationId,
    };

    const b64PrivateKeyWithLineBreaks = Buffer.from(decryptedValue + '\n' + decryptedValue, 'binary').toString(
      'base64',
    );
    mockedGet.mockResolvedValueOnce(GITHUB_APP_ID).mockResolvedValueOnce(b64PrivateKeyWithLineBreaks);

    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    // Add the required hook method to make it compatible with AuthInterface
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    mockedCreatAppAuth.mockReturnValue(mockWithHook);

    // Act
    await createGithubAppAuth(installationId);

    // Assert
    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    expect(mockedCreatAppAuth).toBeCalledWith({ ...authOptions });
  });

  it('Creates auth object for public GitHub', async () => {
    // Arrange
    const authOptions = {
      appId: parseInt(GITHUB_APP_ID),
      privateKey: decryptedValue,
      installationId,
    };
    mockedGet.mockResolvedValueOnce(GITHUB_APP_ID).mockResolvedValueOnce(b64);

    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    // Add the required hook method to make it compatible with AuthInterface
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    mockedCreatAppAuth.mockReturnValue(mockWithHook);

    // Act
    const result = await createGithubAppAuth(installationId);

    // Assert
    expect(getParameter).toBeCalledWith(PARAMETER_GITHUB_APP_ID_NAME);
    expect(getParameter).toBeCalledWith(PARAMETER_GITHUB_APP_KEY_BASE64_NAME);

    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    expect(mockedCreatAppAuth).toBeCalledWith({ ...authOptions });
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

    const authOptions = {
      appId: parseInt(GITHUB_APP_ID),
      privateKey: decryptedValue,
      installationId,
      request: mockedRequestInterface.mockImplementation(() => ({ baseUrl: githubServerUrl })),
    };

    mockedGet.mockResolvedValueOnce(GITHUB_APP_ID).mockResolvedValueOnce(b64);
    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mockedCreatAppAuth.mockImplementation((authOptions: StrategyOptions) => {
      return Object.assign(mockedAuth, { hook: vi.fn() });
    });

    // Act
    const result = await createGithubAppAuth(installationId, githubServerUrl);

    // Assert
    expect(getParameter).toBeCalledWith(PARAMETER_GITHUB_APP_ID_NAME);
    expect(getParameter).toBeCalledWith(PARAMETER_GITHUB_APP_KEY_BASE64_NAME);

    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    expect(mockedCreatAppAuth).toBeCalledWith(authOptions);
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

    const authOptions = {
      appId: parseInt(GITHUB_APP_ID),
      privateKey: decryptedValue,
      request: mockedRequestInterface.mockImplementation(() => ({ baseUrl: githubServerUrl })),
    };

    mockedGet.mockResolvedValueOnce(GITHUB_APP_ID).mockResolvedValueOnce(b64);
    const mockedAuth = vi.fn();
    mockedAuth.mockResolvedValue({ token });
    // Add the required hook method to make it compatible with AuthInterface
    const mockWithHook = Object.assign(mockedAuth, { hook: vi.fn() });
    mockedCreatAppAuth.mockReturnValue(mockWithHook);

    // Act
    const result = await createGithubAppAuth(installationId, githubServerUrl);

    // Assert
    expect(getParameter).toBeCalledWith(PARAMETER_GITHUB_APP_ID_NAME);
    expect(getParameter).toBeCalledWith(PARAMETER_GITHUB_APP_KEY_BASE64_NAME);

    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    expect(mockedCreatAppAuth).toBeCalledWith(authOptions);
    expect(mockedAuth).toBeCalledWith({ type: authType });
    expect(result.token).toBe(token);
  });
});

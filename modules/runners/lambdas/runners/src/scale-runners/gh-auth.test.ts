import { createOctoClient, createGithubAuth } from './gh-auth';
import nock from 'nock';
import { createAppAuth } from '@octokit/auth-app';
import { StrategyOptions } from '@octokit/auth-app/dist-types/types';
import { decrypt } from './kms';
import { RequestInterface } from '@octokit/types';
import { mock, MockProxy } from 'jest-mock-extended';
import { request } from '@octokit/request';

jest.mock('./kms');
jest.mock('@octokit/auth-app');

const cleanEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...cleanEnv };
  nock.disableNetConnect();
});

describe('Test createGithubAuth', () => {
  test('Creates app client to GitHub public', async () => {
    // Arrange
    const token = '123456';

    // Act
    const result = await createOctoClient(token);

    // Assert
    expect(result.request.endpoint.DEFAULTS.baseUrl).toBe('https://api.github.com');
  });

  test('Creates app client to GitHub ES', async () => {
    // Arrange
    const enterpriseServer = 'https://github.enterprise.notgoingtowork';
    const token = '123456';

    // Act
    const result = await createOctoClient(token, enterpriseServer);

    // Assert
    expect(result.request.endpoint.DEFAULTS.baseUrl).toBe(enterpriseServer);
  });
});

describe('Test createGithubAuth', () => {
  const mockedDecrypt = (decrypt as unknown) as jest.Mock;
  const mockedCreatAppAuth = (createAppAuth as unknown) as jest.Mock;
  const mockedDefaults = jest.spyOn(request, 'defaults');
  let mockedRequestInterface: MockProxy<RequestInterface>;

  const installationId = 1;
  const authType = 'app';
  const token = '123456';
  const decryptedValue = 'decryptedValue';
  const b64 = Buffer.from(decryptedValue, 'binary').toString('base64');

  beforeEach(() => {
    process.env.GITHUB_APP_ID = '1';
    process.env.GITHUB_APP_CLIENT_SECRET = 'client_secret';
    process.env.GITHUB_APP_KEY_BASE64 = 'base64';
    process.env.KMS_KEY_ID = 'key_id';
    process.env.ENVIRONMENT = 'dev';
    process.env.GITHUB_APP_CLIENT_ID = '1';
  });

  test('Creates auth object for public GitHub', async () => {
    // Arrange
    const authOptions = {
      appId: parseInt(process.env.GITHUB_APP_ID as string),
      privateKey: 'decryptedValue',
      installationId,
      clientId: process.env.GITHUB_APP_CLIENT_ID,
      clientSecret: 'decryptedValue',
    };

    mockedDecrypt.mockResolvedValueOnce(decryptedValue).mockResolvedValueOnce(b64);
    const mockedAuth = jest.fn();
    mockedAuth.mockResolvedValue({ token });
    mockedCreatAppAuth.mockImplementation((authOptions: StrategyOptions) => {
      return mockedAuth;
    });

    // Act
    const result = await createGithubAuth(installationId, authType);

    // Assert
    expect(mockedDecrypt).toBeCalledWith(
      process.env.GITHUB_APP_CLIENT_SECRET,
      process.env.KMS_KEY_ID,
      process.env.ENVIRONMENT,
    );
    expect(mockedDecrypt).toBeCalledWith(
      process.env.GITHUB_APP_KEY_BASE64,
      process.env.KMS_KEY_ID,
      process.env.ENVIRONMENT,
    );
    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    expect(mockedCreatAppAuth).toBeCalledWith(authOptions);
    expect(mockedAuth).toBeCalledWith({ type: authType });
    expect(result.token).toBe(token);
  });

  test('Creates auth object for Enterprise Server', async () => {
    // Arrange
    const githubServerUrl = 'https://github.enterprise.notgoingtowork';

    mockedRequestInterface = mock<RequestInterface>();
    mockedDefaults.mockImplementation(() => {
      return mockedRequestInterface.defaults({ baseUrl: githubServerUrl });
    });

    const authOptions = {
      appId: parseInt(process.env.GITHUB_APP_ID as string),
      privateKey: 'decryptedValue',
      installationId,
      clientId: process.env.GITHUB_APP_CLIENT_ID,
      clientSecret: 'decryptedValue',
      request: mockedRequestInterface.defaults({ baseUrl: githubServerUrl }),
    };

    mockedDecrypt.mockResolvedValueOnce(decryptedValue).mockResolvedValueOnce(b64);
    const mockedAuth = jest.fn();
    mockedAuth.mockResolvedValue({ token });
    mockedCreatAppAuth.mockImplementation((authOptions: StrategyOptions) => {
      return mockedAuth;
    });

    // Act
    const result = await createGithubAuth(installationId, authType, githubServerUrl);

    // Assert
    expect(mockedDecrypt).toBeCalledWith(
      process.env.GITHUB_APP_CLIENT_SECRET,
      process.env.KMS_KEY_ID,
      process.env.ENVIRONMENT,
    );
    expect(mockedDecrypt).toBeCalledWith(
      process.env.GITHUB_APP_KEY_BASE64,
      process.env.KMS_KEY_ID,
      process.env.ENVIRONMENT,
    );
    expect(mockedCreatAppAuth).toBeCalledTimes(1);
    expect(mockedCreatAppAuth).toBeCalledWith(authOptions);
    expect(mockedAuth).toBeCalledWith({ type: authType });
    expect(result.token).toBe(token);
  });
});

import { GetParameterCommandOutput, SSM } from '@aws-sdk/client-ssm';
import nock from 'nock';
import proxy from 'proxy-agent';

import { getParameterValue } from './ssm';

jest.mock('@aws-sdk/client-ssm');
jest.mock('proxy-agent');

const cleanEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...cleanEnv };
  nock.disableNetConnect();
  // Remove any proxy if existing (from user/execution 'clean' env or from previous test)
  process.env.HTTPS_PROXY = undefined;
});

describe('Test getParameterValue', () => {
  test('Gets parameters and returns string', async () => {
    // Arrange
    const parameterValue = 'test';
    const parameterName = 'testParam';
    const output: GetParameterCommandOutput = {
      Parameter: {
        Name: parameterName,
        Type: 'SecureString',
        Value: parameterValue,
      },
      $metadata: {
        httpStatusCode: 200,
      },
    };

    SSM.prototype.getParameter = jest.fn().mockResolvedValue(output);

    // Act
    const result = await getParameterValue(parameterName);

    // Assert
    expect(result).toBe(parameterValue);
  });

  test('Gets invalid parameters and returns string', async () => {
    // Arrange
    const parameterName = 'invalid';
    const output: GetParameterCommandOutput = {
      $metadata: {
        httpStatusCode: 200,
      },
    };

    SSM.prototype.getParameter = jest.fn().mockResolvedValue(output);

    // Act
    const result = await getParameterValue(parameterName);

    // Assert
    expect(result).toBe(undefined);
  });

  test('Check that proxy is not used if not defined', async () => {
    // Mock it
    const mockedProxy = proxy as unknown as jest.Mock;

    // Act
    await getParameterValue('testParam');

    // Assert not called
    expect(mockedProxy).not.toHaveBeenCalled();
  });

  test('Check that proxy is used', async () => {
    // Define fake proxy
    process.env.HTTPS_PROXY = 'http://proxy.company.com';

    // Mock it
    const mockedProxy = proxy as unknown as jest.Mock;

    // Act
    await getParameterValue('testParam');

    // Assert correctly called
    expect(mockedProxy).toBeCalledWith(process.env.HTTPS_PROXY);
  });

  test('Check that invalid proxy is not used', async () => {
    // Define fake invalid proxy
    process.env.HTTPS_PROXY = 'invalidPrefix://proxy.company.com';

    // Mock it
    const mockedProxy = proxy as unknown as jest.Mock;

    // Act
    await getParameterValue('testParam');

    // Assert not called
    expect(mockedProxy).not.toHaveBeenCalled();
  });

  test('Check proxy unknown host', async () => {
    // Define proxy which is unknown
    process.env.HTTPS_PROXY = 'http://unknown.company.com';

    // Mock it
    const mockedProxy = proxy as unknown as jest.Mock;
    mockedProxy.mockImplementation(() => {
      throw new Error('Unknown host');
    });

    // Assert exception
    await expect(getParameterValue('testParam')).rejects.toHaveProperty('message', 'Unknown host');
  });
});

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

  test('Check that proxy is used', async () => {
    // No 'https_proxy' environment variable should exist, not really testable otherwise
    if (process.env.https_proxy != null) {
      throw new Error('Please remove "https_proxy" environment variable, not testable otherwise');
    }

    // Define fake proxy
    process.env.HTTPS_PROXY = 'http://proxy.company.com';

    // Mock it
    const mockedProxy = proxy as unknown as jest.Mock;

    // Act
    await getParameterValue('testParam');

    // Assert correctly called
    expect(mockedProxy).toBeCalledWith(process.env.HTTPS_PROXY);
  });
});

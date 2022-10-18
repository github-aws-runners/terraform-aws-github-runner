import { GetParameterCommandOutput, SSM } from '@aws-sdk/client-ssm';
import nock from 'nock';

import { getParameterValue } from '.';

jest.mock('@aws-sdk/client-ssm');

const cleanEnv = process.env;
const ENVIRONMENT = 'dev';

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  jest.resetAllMocks();
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
    const result = await getParameterValue(ENVIRONMENT, parameterName);

    // Assert
    expect(result).toBe(parameterValue);
  });

  test('Gets parameters and returns value undefined', async () => {
    // Arrange
    const parameterValue = undefined;
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
    const result = await getParameterValue(ENVIRONMENT, parameterName);

    // Assert
    expect(result).toBe(undefined);
  });

  test('Gets parameters and returns undefined', async () => {
    // Arrange
    const parameterName = 'testParam';
    const output: GetParameterCommandOutput = {
      $metadata: {
        httpStatusCode: 200,
      },
    };

    SSM.prototype.getParameter = jest.fn().mockResolvedValue(output);

    // Act
    const result = await getParameterValue(ENVIRONMENT, parameterName);

    // Assert
    expect(result).toBe(undefined);
  });
});

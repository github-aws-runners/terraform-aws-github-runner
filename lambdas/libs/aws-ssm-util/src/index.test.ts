import { GetParameterCommandOutput, SSM } from '@aws-sdk/client-ssm';
import nock from 'nock';

import { getParameterValue } from '.';

jest.mock('@aws-sdk/client-ssm');

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
});

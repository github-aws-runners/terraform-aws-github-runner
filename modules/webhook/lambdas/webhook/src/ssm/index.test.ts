import nock from 'nock';
import { getParameterValue } from '.';
import { SSM, GetParameterCommandOutput } from '@aws-sdk/client-ssm';

jest.mock('@aws-sdk/client-ssm');

const cleanEnv = process.env;
const ENVIRONMENT = 'dev';

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...cleanEnv };
  nock.disableNetConnect();
});

describe('Test createGithubAuth', () => {
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
});

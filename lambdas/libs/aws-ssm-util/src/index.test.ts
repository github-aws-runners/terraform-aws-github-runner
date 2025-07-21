import {
  GetParameterCommand,
  GetParameterCommandOutput,
  PutParameterCommand,
  PutParameterCommandOutput,
  SSMClient,
} from '@aws-sdk/client-ssm';
import 'aws-sdk-client-mock-jest/vitest';
import { mockClient } from 'aws-sdk-client-mock';
import nock from 'nock';

import { getParameter, putParameter, SSM_ADVANCED_TIER_THRESHOLD } from '.';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSSMClient = mockClient(SSMClient);
const cleanEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
  nock.disableNetConnect();
});

describe('Test getParameter and putParameter', () => {
  it('Gets parameters and returns string', async () => {
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

    mockSSMClient.on(GetParameterCommand).resolves(output);

    // Act
    const result = await getParameter(parameterName);

    // Assert
    expect(result).toBe(parameterValue);
  });

  it('Puts parameters and returns error on failure', async () => {
    // Arrange
    const parameterValue = 'test';
    const parameterName = 'testParam';
    const output: PutParameterCommandOutput = {
      $metadata: {
        httpStatusCode: 401,
      },
    };

    mockSSMClient.on(PutParameterCommand).rejects(output);

    // Act
    await expect(putParameter(parameterName, parameterValue, true)).rejects.toThrow();
  });

  it('Puts parameters and returns success', async () => {
    // Arrange
    const parameterValue = 'test';
    const parameterName = 'testParam';
    const output: PutParameterCommandOutput = {
      $metadata: {
        httpStatusCode: 200,
      },
    };

    mockSSMClient.on(PutParameterCommand).resolves(output);

    // Act
    await expect(putParameter(parameterName, parameterValue, true)).resolves.not.toThrow();
  });

  it('Puts parameters as String', async () => {
    // Arrange
    const parameterValue = 'test';
    const parameterName = 'testParam';
    const secure = false;
    const output: PutParameterCommandOutput = {
      $metadata: {
        httpStatusCode: 200,
      },
    };

    mockSSMClient.on(PutParameterCommand).resolves(output);

    // Act
    await putParameter(parameterName, parameterValue, secure);

    expect(mockSSMClient).toHaveReceivedCommandWith(PutParameterCommand, {
      Name: parameterName,
      Value: parameterValue,
      Type: 'String',
    });
  });

  it('Puts parameters as SecureString', async () => {
    // Arrange
    const parameterValue = 'test';
    const parameterName = 'testParam';
    const secure = true;
    const output: PutParameterCommandOutput = {
      $metadata: {
        httpStatusCode: 200,
      },
    };

    mockSSMClient.on(PutParameterCommand).resolves(output);

    // Act
    await putParameter(parameterName, parameterValue, secure);

    expect(mockSSMClient).toHaveReceivedCommandWith(PutParameterCommand, {
      Name: parameterName,
      Value: parameterValue,
      Type: 'SecureString',
    });
  });

  it('Gets invalid parameters and returns string', async () => {
    // Arrange
    const parameterName = 'invalid';
    const output: GetParameterCommandOutput = {
      $metadata: {
        httpStatusCode: 200,
      },
    };

    mockSSMClient.on(GetParameterCommand).resolves(output);

    // Act
    await expect(getParameter(parameterName)).rejects.toThrow(`Parameter ${parameterName} not found`);
  });

  it.each([
    ['a'.repeat(SSM_ADVANCED_TIER_THRESHOLD - 1), 'Standard'],
    ['a'.repeat(SSM_ADVANCED_TIER_THRESHOLD), 'Advanced'],
    ['a'.repeat(SSM_ADVANCED_TIER_THRESHOLD + 1), 'Advanced'],
  ])('Puts parameters with value and sets correct SSM tier based on size and threshold', async (data, expectedTier) => {
    // Arrange
    const parameterValue = data;
    const parameterName = 'testParamSmall';
    const secure = false;
    const output: PutParameterCommandOutput = {
      $metadata: { httpStatusCode: 200 },
    };
    mockSSMClient.on(PutParameterCommand).resolves(output);

    // Act
    await putParameter(parameterName, parameterValue, secure);

    // Assert
    expect(mockSSMClient).toHaveReceivedCommandWith(PutParameterCommand, {
      Name: parameterName,
      Value: parameterValue,
      Type: 'String',
      Tier: expectedTier,
    });
  });
});

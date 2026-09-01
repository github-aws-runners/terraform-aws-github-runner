import {
  GetSecretValueCommand,
  GetSecretValueCommandOutput,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
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
const mockSecretsManagerClient = mockClient(SecretsManagerClient);
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

describe('Test getParameter with Secrets Manager references', () => {
  const secretArn = 'arn:aws:secretsmanager:us-east-1:123456789012:secret:my-secret-AbCdEf';

  it('Gets a Secrets Manager ARN without a jsonKey and returns the raw secret string', async () => {
    // Arrange
    const secretValue = 'raw-secret-value';
    const output: GetSecretValueCommandOutput = {
      SecretString: secretValue,
      $metadata: { httpStatusCode: 200 },
    };
    mockSecretsManagerClient.on(GetSecretValueCommand).resolves(output);

    // Act
    const result = await getParameter(secretArn);

    // Assert
    expect(result).toBe(secretValue);
  });

  it('Gets a Secrets Manager ARN with a jsonKey and returns that key as a string', async () => {
    // Arrange
    const output: GetSecretValueCommandOutput = {
      SecretString: JSON.stringify({ webhook_secret: 'abc123' }),
      $metadata: { httpStatusCode: 200 },
    };
    mockSecretsManagerClient.on(GetSecretValueCommand).resolves(output);

    // Act
    const result = await getParameter(`${secretArn}#webhook_secret`);

    // Assert
    expect(result).toBe('abc123');
  });

  it('Gets a Secrets Manager ARN with a jsonKey where the JSON value is a number and returns it stringified', async () => {
    // Arrange
    const output: GetSecretValueCommandOutput = {
      SecretString: JSON.stringify({ id: 123456 }),
      $metadata: { httpStatusCode: 200 },
    };
    mockSecretsManagerClient.on(GetSecretValueCommand).resolves(output);

    // Act
    const result = await getParameter(`${secretArn}#id`);

    // Assert
    expect(result).toBe('123456');
  });

  it('Throws when the secret cannot be retrieved', async () => {
    // Arrange
    const output: GetSecretValueCommandOutput = {
      $metadata: { httpStatusCode: 200 },
    };
    mockSecretsManagerClient.on(GetSecretValueCommand).resolves(output);

    // Act + Assert
    await expect(getParameter(secretArn)).rejects.toThrow(`Secret ${secretArn} not found`);
  });

  it('Throws when the requested jsonKey is missing from the secret', async () => {
    // Arrange
    const output: GetSecretValueCommandOutput = {
      SecretString: JSON.stringify({ id: 123456 }),
      $metadata: { httpStatusCode: 200 },
    };
    mockSecretsManagerClient.on(GetSecretValueCommand).resolves(output);

    // Act + Assert
    await expect(getParameter(`${secretArn}#missing_key`)).rejects.toThrow(
      `Key "missing_key" not found in secret ${secretArn}`,
    );
  });

  it('Throws when the requested jsonKey is null in the secret', async () => {
    // Arrange
    const output: GetSecretValueCommandOutput = {
      SecretString: JSON.stringify({ webhook_secret: null }),
      $metadata: { httpStatusCode: 200 },
    };
    mockSecretsManagerClient.on(GetSecretValueCommand).resolves(output);

    // Act + Assert
    await expect(getParameter(`${secretArn}#webhook_secret`)).rejects.toThrow(
      `Key "webhook_secret" not found in secret ${secretArn}`,
    );
  });

  it('Throws when a jsonKey is requested against a secret value that is valid JSON but not an object', async () => {
    // Arrange
    const output: GetSecretValueCommandOutput = {
      SecretString: JSON.stringify(5),
      $metadata: { httpStatusCode: 200 },
    };
    mockSecretsManagerClient.on(GetSecretValueCommand).resolves(output);

    // Act + Assert
    await expect(getParameter(`${secretArn}#webhook_secret`)).rejects.toThrow(
      `Secret ${secretArn} is not a JSON object, cannot read key "webhook_secret"`,
    );
  });

  it('Throws when a jsonKey is requested against a non-JSON secret value, without leaking the value', async () => {
    // Arrange
    const secretValue = 'not-json';
    const output: GetSecretValueCommandOutput = {
      SecretString: secretValue,
      $metadata: { httpStatusCode: 200 },
    };
    mockSecretsManagerClient.on(GetSecretValueCommand).resolves(output);

    // Act
    let error: Error | undefined;
    try {
      await getParameter(`${secretArn}#webhook_secret`);
    } catch (e) {
      error = e as Error;
    }

    // Assert
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toContain(secretArn);
    expect(error?.message).not.toContain(secretValue);
  });
});

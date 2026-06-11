import {
  GetParameterCommand,
  GetParameterCommandOutput,
  GetParametersCommand,
  PutParameterCommand,
  PutParameterCommandOutput,
  SSMClient,
} from '@aws-sdk/client-ssm';
import 'aws-sdk-client-mock-jest/vitest';
import { mockClient } from 'aws-sdk-client-mock';
import nock from 'nock';

import { getParameter, getParameters, putParameter, SSM_ADVANCED_TIER_THRESHOLD } from '.';
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

describe('Test getParameters (batch)', () => {
  beforeEach(() => {
    mockSSMClient.reset();
  });

  it('returns multiple parameters in a single call', async () => {
    mockSSMClient.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: '/app/param1', Value: 'value1' },
        { Name: '/app/param2', Value: 'value2' },
      ],
    });

    const result = await getParameters(['/app/param1', '/app/param2']);

    expect(result).toEqual(
      new Map([
        ['/app/param1', 'value1'],
        ['/app/param2', 'value2'],
      ]),
    );
    expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersCommand, {
      Names: ['/app/param1', '/app/param2'],
      WithDecryption: true,
    });
  });

  it('returns empty map for empty input', async () => {
    const result = await getParameters([]);

    expect(result).toEqual(new Map());
    expect(mockSSMClient).not.toHaveReceivedCommand(GetParametersCommand);
  });

  it('chunks requests when more than 10 parameters', async () => {
    const names = Array.from({ length: 12 }, (_, i) => `/app/param${i}`);

    mockSSMClient
      .on(GetParametersCommand, { Names: names.slice(0, 10), WithDecryption: true })
      .resolves({
        Parameters: names.slice(0, 10).map((name) => ({ Name: name, Value: `val-${name}` })),
      })
      .on(GetParametersCommand, { Names: names.slice(10), WithDecryption: true })
      .resolves({
        Parameters: names.slice(10).map((name) => ({ Name: name, Value: `val-${name}` })),
      });

    const result = await getParameters(names);

    expect(result.size).toBe(12);
    expect(mockSSMClient).toHaveReceivedCommandTimes(GetParametersCommand, 2);
    for (const name of names) {
      expect(result.get(name)).toBe(`val-${name}`);
    }
  });

  it('omits parameters with missing Name or Value', async () => {
    mockSSMClient.on(GetParametersCommand).resolves({
      Parameters: [
        { Name: '/app/good', Value: 'value' },
        { Name: '/app/no-value', Value: undefined },
        { Name: undefined, Value: 'orphan' },
      ],
    });

    const result = await getParameters(['/app/good', '/app/no-value']);

    expect(result).toEqual(new Map([['/app/good', 'value']]));
  });

  it('propagates errors from SSM API', async () => {
    mockSSMClient.on(GetParametersCommand).rejects(new Error('AccessDenied'));

    await expect(getParameters(['/app/param1'])).rejects.toThrow('AccessDenied');
  });

  it('handles response with empty Parameters array', async () => {
    mockSSMClient.on(GetParametersCommand).resolves({
      Parameters: [],
    });

    const result = await getParameters(['/app/missing']);

    expect(result).toEqual(new Map());
  });
});

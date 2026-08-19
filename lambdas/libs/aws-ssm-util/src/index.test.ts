import {
  DeleteParameterCommand,
  GetParameterCommand,
  GetParameterCommandOutput,
  GetParametersByPathCommand,
  GetParametersCommand,
  PutParameterCommand,
  PutParameterCommandOutput,
  SSMClient,
} from '@aws-sdk/client-ssm';
import 'aws-sdk-client-mock-jest/vitest';
import { mockClient } from 'aws-sdk-client-mock';
import nock from 'nock';

import {
  deleteParameter,
  getParameter,
  getParameters,
  getParametersByPath,
  putParameter,
  resetSSMClient,
  ssmClient,
  SSM_ADVANCED_TIER_THRESHOLD,
} from '.';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSSMClient = mockClient(SSMClient);
const cleanEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
  resetSSMClient();
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

  it('overwrites a parameter only when explicitly requested', async () => {
    mockSSMClient.on(PutParameterCommand).resolves({});

    await putParameter('testParam', 'updated', false, { overwrite: true });

    expect(mockSSMClient).toHaveReceivedCommandWith(PutParameterCommand, {
      Name: 'testParam',
      Value: 'updated',
      Type: 'String',
      Overwrite: true,
    });
  });

  it('rejects tags when overwriting an existing parameter', async () => {
    mockSSMClient.resetHistory();
    await expect(
      putParameter('testParam', 'updated', false, {
        overwrite: true,
        tags: [{ Key: 'owner', Value: 'runner' }],
      } as never),
    ).rejects.toThrow('tags cannot be supplied when overwriting');
    expect(mockSSMClient).not.toHaveReceivedCommand(PutParameterCommand);
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

describe('Test direct parameter path operations', () => {
  beforeEach(() => {
    mockSSMClient.reset();
  });

  it('paginates direct, non-secret children of a parameter path', async () => {
    mockSSMClient
      .on(GetParametersByPathCommand, {
        Path: '/metadata',
        Recursive: false,
        WithDecryption: false,
        NextToken: undefined,
      })
      .resolves({ Parameters: [{ Name: '/metadata/one', Value: '1' }], NextToken: 'page-2' })
      .on(GetParametersByPathCommand, {
        Path: '/metadata',
        Recursive: false,
        WithDecryption: false,
        NextToken: 'page-2',
      })
      .resolves({ Parameters: [{ Name: '/metadata/two', Value: '2' }] });

    await expect(getParametersByPath('/metadata')).resolves.toEqual(
      new Map([
        ['/metadata/one', '1'],
        ['/metadata/two', '2'],
      ]),
    );
    expect(mockSSMClient).toHaveReceivedCommandTimes(GetParametersByPathCommand, 2);
  });

  it('deletes an exact parameter name', async () => {
    mockSSMClient.on(DeleteParameterCommand).resolves({});

    await deleteParameter('/metadata/one');

    expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParameterCommand, { Name: '/metadata/one' });
  });
});

describe('SSM client configuration', () => {
  it('configures adaptive retry with a raised attempt cap', async () => {
    const config = ssmClient().config;

    expect(await config.maxAttempts()).toBe(10);
    expect(config.retryMode).toBe('adaptive');
  });

  it('reuses one client so adaptive rate-sensing state survives across calls', async () => {
    // Adaptive retry keeps its token bucket on the client instance; a fresh client
    // per call would silently downgrade `adaptive` to plain retries.
    mockSSMClient.on(GetParametersCommand).resolves({ Parameters: [] });

    await getParameters(['/app/one']);
    await getParameters(['/app/two']);

    expect(ssmClient()).toBe(ssmClient());
  });

  it('picks up the region from the environment on first use', async () => {
    process.env.AWS_REGION = 'eu-north-1';
    resetSSMClient();

    expect(await ssmClient().config.region()).toBe('eu-north-1');
  });
});

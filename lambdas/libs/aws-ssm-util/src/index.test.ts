import {
  GetParameterCommand,
  GetParameterCommandOutput,
  GetParametersByPathCommand,
  GetParametersByPathCommandOutput,
  PutParameterCommand,
  PutParameterCommandOutput,
  SSMClient,
} from '@aws-sdk/client-ssm';
import 'aws-sdk-client-mock-jest/vitest';
import { mockClient } from 'aws-sdk-client-mock';
import nock from 'nock';

import { getParameter, getParametersByPath, putParameter, SSM_ADVANCED_TIER_THRESHOLD } from '.';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSSMClient = mockClient(SSMClient);
const cleanEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockSSMClient.reset();
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

  describe('getParametersByPath', () => {
    it('returns parameters for single page result', async () => {
      const output: GetParametersByPathCommandOutput = {
        Parameters: [
          { Name: '/path/param1', Value: 'value1' },
          { Name: '/path/param2', Value: 'value2' },
        ],
        $metadata: { httpStatusCode: 200 },
      };

      mockSSMClient.on(GetParametersByPathCommand).resolves(output);

      await expect(getParametersByPath('/path')).resolves.toEqual({
        '/path/param1': 'value1',
        '/path/param2': 'value2',
      });
    });

    it('paginates over multiple responses', async () => {
      const firstPage: GetParametersByPathCommandOutput = {
        Parameters: [{ Name: '/path/param1', Value: 'value1' }],
        NextToken: 'TOKEN',
        $metadata: { httpStatusCode: 200 },
      };
      const secondPage: GetParametersByPathCommandOutput = {
        Parameters: [{ Name: '/path/param2', Value: 'value2' }],
        $metadata: { httpStatusCode: 200 },
      };

      mockSSMClient
        .on(GetParametersByPathCommand, { Path: '/path', Recursive: false, WithDecryption: true })
        .resolvesOnce(firstPage)
        .resolvesOnce(secondPage);

      const result = await getParametersByPath('/path');

      expect(result).toEqual({ '/path/param1': 'value1', '/path/param2': 'value2' });
      expect(mockSSMClient).toHaveReceivedCommandTimes(GetParametersByPathCommand, 2);
    });

    it('returns empty record when path is empty', async () => {
      await expect(getParametersByPath('')).resolves.toEqual({});
      expect(mockSSMClient).not.toHaveReceivedCommand(GetParametersByPathCommand);
    });

    it('returns empty record when no parameters exist at path', async () => {
      const output: GetParametersByPathCommandOutput = {
        Parameters: [],
        $metadata: { httpStatusCode: 200 },
      };

      mockSSMClient.on(GetParametersByPathCommand).resolves(output);

      await expect(getParametersByPath('/path')).resolves.toEqual({});
    });

    it('uses recursive option when specified', async () => {
      const output: GetParametersByPathCommandOutput = {
        Parameters: [{ Name: '/path/nested/param1', Value: 'value1' }],
        $metadata: { httpStatusCode: 200 },
      };

      mockSSMClient
        .on(GetParametersByPathCommand, { Path: '/path', Recursive: true, WithDecryption: true })
        .resolves(output);

      const result = await getParametersByPath('/path', { recursive: true });

      expect(result).toEqual({ '/path/nested/param1': 'value1' });
      expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersByPathCommand, {
        Path: '/path',
        Recursive: true,
        WithDecryption: true,
      });
    });

    it.each([
      {
        description: 'filters out parameters with missing Name',
        mockParameters: [
          { Name: '/path/param1', Value: 'value1' },
          { Value: 'value2' }, // no Name
        ],
        expectedOutput: { '/path/param1': 'value1' },
      },
      {
        description: 'filters out parameters with undefined Value',
        mockParameters: [
          { Name: '/path/param1', Value: 'value1' },
          { Name: '/path/param2' }, // undefined Value
        ],
        expectedOutput: { '/path/param1': 'value1' },
      },
      {
        description: 'includes parameters with empty string Value',
        mockParameters: [
          { Name: '/path/param1', Value: '' },
          { Name: '/path/param2', Value: 'value2' },
        ],
        expectedOutput: { '/path/param1': '', '/path/param2': 'value2' },
      },
      {
        description: 'handles mix of valid and invalid parameters',
        mockParameters: [
          { Name: '/path/param1', Value: 'value1' },
          { Value: 'no-name' },
          { Name: '/path/param2' }, // undefined Value
          { Name: '/path/param3', Value: 'value3' },
        ],
        expectedOutput: { '/path/param1': 'value1', '/path/param3': 'value3' },
      },
    ])('$description', async ({ mockParameters, expectedOutput }) => {
      const output: GetParametersByPathCommandOutput = {
        Parameters: mockParameters,
        $metadata: { httpStatusCode: 200 },
      };

      mockSSMClient.on(GetParametersByPathCommand).resolves(output);

      await expect(getParametersByPath('/path')).resolves.toEqual(expectedOutput);
    });
  });
});

import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import 'aws-sdk-client-mock-jest/vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import moment from 'moment-timezone';

import {
  InvalidEvictionStrategyError,
  InvalidIdleConfigEntryError,
  InvalidIdleConfigError,
  InvalidJsonError,
  MissingMinimumRunningTimeError,
  MissingRunnerBootTimeError,
  ScaleDownConfigurationsNotFoundError,
  getEvictionStrategy,
  getIdleRunnerCount,
  loadEnvironmentScaleDownConfigFromSsm,
} from './scale-down-config';

const mockSSMClient = mockClient(SSMClient);

describe('loadEnvironmentScaleDownConfigFromSsm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSSMClient.reset();
  });

  it('loads and parses configurations for multiple environments', async () => {
    mockSSMClient
      .on(GetParametersByPathCommand, {
        Path: '/configs',
        Recursive: false,
        WithDecryption: true,
      })
      .resolves({
        Parameters: [
          {
            Name: '/configs/env-a',
            Value: JSON.stringify({
              environment: 'env-a',
              idle_config: [
                {
                  cron: '* * * * * *',
                  timeZone: 'UTC',
                  idleCount: 1,
                  evictionStrategy: 'oldest_first',
                },
              ],
              minimum_running_time_in_minutes: 10,
              runner_boot_time_in_minutes: 5,
            }),
          },
          {
            Name: '/configs/env-b',
            Value: JSON.stringify({
              idle_config: [],
              minimum_running_time_in_minutes: 20,
              runner_boot_time_in_minutes: 8,
            }),
          },
        ],
      });

    const configs = await loadEnvironmentScaleDownConfigFromSsm('/configs/');

    expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersByPathCommand, {
      Path: '/configs',
      Recursive: false,
      WithDecryption: true,
    });
    expect(configs).toEqual([
      {
        environment: 'env-a',
        idle_config: [
          {
            cron: '* * * * * *',
            timeZone: 'UTC',
            idleCount: 1,
            evictionStrategy: 'oldest_first',
          },
        ],
        minimum_running_time_in_minutes: 10,
        runner_boot_time_in_minutes: 5,
      },
      {
        environment: 'env-b',
        idle_config: [],
        minimum_running_time_in_minutes: 20,
        runner_boot_time_in_minutes: 8,
      },
    ]);
  });

  it('normalizes provided path prefix', async () => {
    mockSSMClient
      .on(GetParametersByPathCommand, {
        Path: '/configs',
        Recursive: false,
        WithDecryption: true,
      })
      .resolves({
        Parameters: [
          {
            Name: '/configs/env',
            Value: JSON.stringify({
              idle_config: [],
              minimum_running_time_in_minutes: 5,
              runner_boot_time_in_minutes: 2,
            }),
          },
        ],
      });

    await loadEnvironmentScaleDownConfigFromSsm('configs');

    expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersByPathCommand, {
      Path: '/configs',
      Recursive: false,
      WithDecryption: true,
    });
  });

  it('throws when no parameters are found', async () => {
    mockSSMClient
      .on(GetParametersByPathCommand, {
        Path: '/configs',
        Recursive: false,
        WithDecryption: true,
      })
      .resolves({ Parameters: [] });

    await expect(loadEnvironmentScaleDownConfigFromSsm('/configs')).rejects.toMatchObject({
      prefix: '/configs',
    });
  });

  it('throws when configuration is invalid JSON', async () => {
    mockSSMClient
      .on(GetParametersByPathCommand, {
        Path: '/configs',
        Recursive: false,
        WithDecryption: true,
      })
      .resolves({
        Parameters: [
          {
            Name: '/configs/env',
            Value: '{invalid json',
          },
        ],
      });

    await expect(loadEnvironmentScaleDownConfigFromSsm('/configs')).rejects.toMatchObject({
      path: '/configs/env',
    });
  });

  it.each([
    {
      description: 'minimum_running_time_in_minutes is missing',
      config: {
        idle_config: [],
        runner_boot_time_in_minutes: 5,
      },
    },
    {
      description: 'minimum_running_time_in_minutes is NaN',
      config: {
        idle_config: [],
        minimum_running_time_in_minutes: NaN,
        runner_boot_time_in_minutes: 5,
      },
    },
    {
      description: 'runner_boot_time_in_minutes is missing',
      config: {
        idle_config: [],
        minimum_running_time_in_minutes: 5,
      },
    },
    {
      description: 'runner_boot_time_in_minutes is NaN',
      config: {
        idle_config: [],
        minimum_running_time_in_minutes: 5,
        runner_boot_time_in_minutes: NaN,
      },
    },
  ])('throws when $description', async ({ config }) => {
    mockSSMClient
      .on(GetParametersByPathCommand, {
        Path: '/configs',
        Recursive: false,
        WithDecryption: true,
      })
      .resolves({
        Parameters: [
          {
            Name: '/configs/env',
            Value: JSON.stringify(config),
          },
        ],
      });

    await expect(loadEnvironmentScaleDownConfigFromSsm('/configs')).rejects.toMatchObject({
      path: '/configs/env',
    });
  });

  it('throws when environment name contains slashes', async () => {
    mockSSMClient
      .on(GetParametersByPathCommand, {
        Path: '/configs',
        Recursive: false,
        WithDecryption: true,
      })
      .resolves({
        Parameters: [
          {
            Name: '/configs/env/nested',
            Value: JSON.stringify({
              idle_config: [],
              minimum_running_time_in_minutes: 5,
              runner_boot_time_in_minutes: 2,
            }),
          },
        ],
      });

    await expect(loadEnvironmentScaleDownConfigFromSsm('/configs')).rejects.toMatchObject({
      path: '/configs/env/nested',
      environment: 'env/nested',
    });
  });

  it.each([
    {
      description: 'idle_config is not an array',
      config: {
        idle_config: 'not an array',
        minimum_running_time_in_minutes: 5,
        runner_boot_time_in_minutes: 2,
      },
      expectedError: InvalidIdleConfigError,
    },
    {
      description: 'idle_config entry is missing cron',
      config: {
        idle_config: [{ timeZone: 'UTC', idleCount: 1 }],
        minimum_running_time_in_minutes: 5,
        runner_boot_time_in_minutes: 2,
      },
      expectedError: InvalidIdleConfigEntryError,
      expectedMatch: { index: 0 },
    },
    {
      description: 'idle_config entry is missing timeZone',
      config: {
        idle_config: [{ cron: '* * * * * *', idleCount: 1 }],
        minimum_running_time_in_minutes: 5,
        runner_boot_time_in_minutes: 2,
      },
      expectedError: InvalidIdleConfigEntryError,
      expectedMatch: { index: 0 },
    },
    {
      description: 'idle_config entry is missing idleCount',
      config: {
        idle_config: [{ cron: '* * * * * *', timeZone: 'UTC' }],
        minimum_running_time_in_minutes: 5,
        runner_boot_time_in_minutes: 2,
      },
      expectedError: InvalidIdleConfigEntryError,
      expectedMatch: { index: 0 },
    },
    {
      description: 'idle_config entry has invalid evictionStrategy',
      config: {
        idle_config: [
          {
            cron: '* * * * * *',
            timeZone: 'UTC',
            idleCount: 1,
            evictionStrategy: 'invalid_strategy',
          },
        ],
        minimum_running_time_in_minutes: 5,
        runner_boot_time_in_minutes: 2,
      },
      expectedError: InvalidEvictionStrategyError,
      expectedMatch: { index: 0, evictionStrategy: 'invalid_strategy' },
    },
  ])('throws when $description', async ({ config, expectedError, expectedMatch }) => {
    mockSSMClient
      .on(GetParametersByPathCommand, {
        Path: '/configs',
        Recursive: false,
        WithDecryption: true,
      })
      .resolves({
        Parameters: [
          {
            Name: '/configs/env',
            Value: JSON.stringify(config),
          },
        ],
      });

    const expectation = expect(loadEnvironmentScaleDownConfigFromSsm('/configs')).rejects;
    if (expectedMatch) {
      await expectation.toMatchObject({
        path: '/configs/env',
        ...expectedMatch,
      });
      return;
    }
    await expectation.toThrow(expectedError);
  });
});

describe('scale-down config helpers', () => {
  const DEFAULT_TIMEZONE = 'America/Los_Angeles';
  const DEFAULT_IDLE_COUNT = 1;

  function buildConfig(cronExpressions: string[], evictionStrategy?: 'oldest_first' | 'newest_first') {
    return cronExpressions.map((cron) => ({
      cron,
      idleCount: DEFAULT_IDLE_COUNT,
      timeZone: DEFAULT_TIMEZONE,
      evictionStrategy,
    }));
  }

  it('returns idle runner count when cron expression matches current time', () => {
    const result = getIdleRunnerCount(buildConfig(['* * * * * *']));
    expect(result).toBe(DEFAULT_IDLE_COUNT);
  });

  it('returns zero when no cron expressions match', () => {
    const now = moment();
    const mismatch = `* * * * * ${(now.day() + 1) % 7}`;
    const result = getIdleRunnerCount(buildConfig([mismatch]));
    expect(result).toBe(0);
  });

  it('prefers eviction strategy from matching cron expression', () => {
    const configs = buildConfig(['* * * * * *'], 'newest_first');
    expect(getEvictionStrategy(configs)).toBe('newest_first');
  });

  it('falls back to oldest_first when no cron matches', () => {
    const now = moment();
    const mismatch = `* * * * * ${(now.day() + 1) % 7}`;
    const configs = buildConfig([mismatch], 'newest_first');
    expect(getEvictionStrategy(configs)).toBe('oldest_first');
  });
});

import type {
  RunnerConfigConsumer,
  RunnerConfigStorageContext,
} from '@aws-github-runner/storage-providers/runner-config-consumer';

import { StorageJitConfigSource } from './storage';

const DYNAMODB_STORAGE: RunnerConfigStorageContext = {
  RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME: 'github-runner-config',
  RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_dynamodb',
};

describe('StorageJitConfigSource', () => {
  it('exports the allowlisted context once before resolving and consuming from the environment', async () => {
    const events: string[] = [];
    const environment: NodeJS.ProcessEnv = {};
    const consumer: RunnerConfigConsumer = {
      consume: vi.fn(async () => {
        events.push('consume');
        return 'encoded-jit';
      }),
    };
    const exportEnvironment = vi.fn((context: RunnerConfigStorageContext, target: NodeJS.ProcessEnv) => {
      events.push('export');
      Object.assign(target, context);
    });
    const createConsumer = vi.fn((target: NodeJS.ProcessEnv) => {
      events.push('create');
      expect(target).toBe(environment);
      expect(target).toMatchObject(DYNAMODB_STORAGE);
      return consumer;
    });
    const source = new StorageJitConfigSource({ createConsumer, environment, exportEnvironment });
    const signal = new AbortController().signal;

    await expect(
      source.consume({ microvmId: 'microvm-1234', storage: DYNAMODB_STORAGE }, { deadlineMs: 123_456, signal }),
    ).resolves.toEqual({ jitConfig: 'encoded-jit' });
    await expect(
      source.consume(
        {
          microvmId: 'microvm-1234',
          storage: {
            RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_dynamodb',
            RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME: 'github-runner-config',
          },
        },
        { deadlineMs: 123_457, signal },
      ),
    ).resolves.toEqual({ jitConfig: 'encoded-jit' });

    expect(events).toEqual(['export', 'create', 'consume', 'create', 'consume']);
    expect(exportEnvironment).toHaveBeenCalledOnce();
    expect(createConsumer).toHaveBeenCalledTimes(2);
    expect(consumer.consume).toHaveBeenNthCalledWith(1, 'microvm-1234', {
      deadlineMs: 123_456,
      signal,
    });
  });

  it('rejects storage context changes after the one-time environment export', async () => {
    const environment: NodeJS.ProcessEnv = {};
    const consumer: RunnerConfigConsumer = { consume: vi.fn().mockResolvedValue('encoded-jit') };
    const exportEnvironment = vi.fn((context: RunnerConfigStorageContext, target: NodeJS.ProcessEnv) => {
      Object.assign(target, context);
    });
    const createConsumer = vi.fn().mockReturnValue(consumer);
    const source = new StorageJitConfigSource({ createConsumer, environment, exportEnvironment });
    const options = { deadlineMs: 123_456, signal: new AbortController().signal };

    await source.consume({ microvmId: 'microvm-1234', storage: DYNAMODB_STORAGE }, options);
    await expect(
      source.consume(
        {
          microvmId: 'microvm-1234',
          storage: {
            RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
            SSM_TOKEN_PATH: '/github-action-runners/tenant/token',
          },
        },
        options,
      ),
    ).rejects.toThrow('storage context cannot change');

    expect(exportEnvironment).toHaveBeenCalledOnce();
    expect(createConsumer).toHaveBeenCalledOnce();
  });
});

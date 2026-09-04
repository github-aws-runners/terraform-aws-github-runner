import type {
  RunnerConfigConsumer,
  RunnerConfigStorageContext,
} from '@aws-github-runner/storage-providers/runner-config-consumer';

import { StorageJitConfigSource } from './storage';

const SSM_STORAGE: RunnerConfigStorageContext = {
  RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
  SSM_TOKEN_PATH: '/github-action-runners/tenant/token',
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
    const exportEnvironment = vi.fn((context: RunnerConfigStorageContext) => {
      events.push('export');
      return context;
    });
    const createConsumer = vi.fn((target: NodeJS.ProcessEnv) => {
      events.push('create');
      expect(target).toBe(environment);
      expect(target).toMatchObject(SSM_STORAGE);
      return consumer;
    });
    const source = new StorageJitConfigSource({ createConsumer, environment, exportEnvironment });
    const signal = new AbortController().signal;

    await expect(
      source.consume({ microvmId: 'microvm-1234', storage: SSM_STORAGE }, { deadlineMs: 123_456, signal }),
    ).resolves.toEqual({ jitConfig: 'encoded-jit' });
    await expect(
      source.consume(
        {
          microvmId: 'microvm-1234',
          storage: {
            RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
            SSM_TOKEN_PATH: '/github-action-runners/tenant/token',
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
    const exportEnvironment = vi.fn((context: RunnerConfigStorageContext) => context);
    const createConsumer = vi.fn().mockReturnValue(consumer);
    const source = new StorageJitConfigSource({ createConsumer, environment, exportEnvironment });
    const options = { deadlineMs: 123_456, signal: new AbortController().signal };

    await source.consume({ microvmId: 'microvm-1234', storage: SSM_STORAGE }, options);
    await expect(
      source.consume(
        {
          microvmId: 'microvm-1234',
          storage: {
            RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
            SSM_TOKEN_PATH: '/github-action-runners/other/token',
          },
        },
        options,
      ),
    ).rejects.toThrow('storage context cannot change');

    expect(exportEnvironment).toHaveBeenCalledOnce();
    expect(createConsumer).toHaveBeenCalledOnce();
  });
});

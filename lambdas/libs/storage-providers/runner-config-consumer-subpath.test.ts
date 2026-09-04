import {
  createRunnerConfigConsumerFromEnvironment,
  exportRunnerConfigStorageEnvironment,
  loadRunnerConfigStorageContextFromEnvironment,
  parseRunnerConfigStorageContext,
  type RunnerConfigConsumeOptions,
  type RunnerConfigConsumer,
  type RunnerConfigStorageContext,
  type RunnerConfigStorageEnvironment,
} from '@aws-github-runner/storage-providers/runner-config-consumer';
import { describe, expect, it } from 'vitest';

describe('runner config consumer package subpath', () => {
  it('exposes the portable environment round-trip and consumer contract', () => {
    const context: RunnerConfigStorageContext = {
      RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
      SSM_TOKEN_PATH: '/runner/tokens',
    };
    const options: RunnerConfigConsumeOptions = {
      deadlineMs: Date.now() + 1_000,
      signal: new AbortController().signal,
    };
    const exported: RunnerConfigStorageEnvironment = exportRunnerConfigStorageEnvironment(context, {});
    const consumerFactory: () => RunnerConfigConsumer = createRunnerConfigConsumerFromEnvironment;

    expect(parseRunnerConfigStorageContext(context)).toEqual(context);
    expect(loadRunnerConfigStorageContextFromEnvironment(exported)).toEqual(context);
    expect(consumerFactory).toBeTypeOf('function');
    expect(options.signal.aborted).toBe(false);
  });
});

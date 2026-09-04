import { afterEach, describe, expect, it, vi } from 'vitest';

import { AwsSdkSsmRunnerConfigApi, type AwsSsmRunnerConfigApi } from './aws/ssm/runner-config-consumer';
import {
  createRunnerConfigConsumerFromEnvironment,
  exportRunnerConfigStorageEnvironment,
  loadRunnerConfigConsumerConfigFromEnvironment,
  loadRunnerConfigStorageContextFromEnvironment,
  parseRunnerConfigStorageContext,
  runnerConfigStorageEnvironment,
} from './runner-config-consumer';

const ssmContext = {
  RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
  SSM_TOKEN_PATH: '/runner/tokens',
} as const;
describe('runner config storage context', () => {
  it('parses and freezes an exact SSM environment map while canonicalizing one trailing slash', () => {
    const context = parseRunnerConfigStorageContext({ ...ssmContext, SSM_TOKEN_PATH: '/runner/tokens/' });

    expect(context).toEqual(ssmContext);
    expect(Object.isFrozen(context)).toBe(true);
    expect(runnerConfigStorageEnvironment(context)).toEqual(ssmContext);
  });

  it.each([
    null,
    [],
    'aws_ssm',
    { RUNNER_CONFIG_STORAGE_PROVIDER: 'AWS_SSM', SSM_TOKEN_PATH: '/runner/tokens' },
    { RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm' },
    { ...ssmContext, unexpected: true },
    { ...ssmContext, AWS_ACCESS_KEY_ID: 'payload-must-not-export-credentials' },
    { ...ssmContext, RUNNER_CONFIG_TIMEOUT_SECONDS: '60' },
    { ...ssmContext, RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME: 'runner-state' },
    { ...ssmContext, SSM_TOKEN_PATH: '/runner//tokens' },
    { ...ssmContext, SSM_TOKEN_PATH: '/runner/tokens//' },
    { ...ssmContext, SSM_TOKEN_PATH: '/awsParameters/tokens' },
    { ...ssmContext, SSM_TOKEN_PATH: '/ssm-private/tokens' },
    { ...ssmContext, SSM_TOKEN_PATH: '/runner/../tokens' },
    { RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_dynamodb', SSM_TOKEN_PATH: '/runner/tokens' },
    { provider: 'aws_dynamodb', tableName: 'runner-state' },
  ])('rejects a non-allowlisted or incomplete storage context %#', (value) => {
    expect(() => parseRunnerConfigStorageContext(value)).toThrow();
  });

  it('rejects symbol fields that would be hidden by JSON-style key enumeration', () => {
    const context = { ...ssmContext };
    Object.defineProperty(context, Symbol('unexpected'), { value: true });

    expect(() => parseRunnerConfigStorageContext(context)).toThrow('storage context is invalid');
  });

  it.each([
    [
      {
        ...ssmContext,
        AWS_ACCESS_KEY_ID: 'producer-only',
        RUNNER_CONFIG_TIMEOUT_SECONDS: '30',
        UNRELATED: 'kept-out',
      },
      ssmContext,
    ],
  ])('selects only the chosen provider locator from a broader producer environment %#', (environment, expected) => {
    expect(loadRunnerConfigStorageContextFromEnvironment(environment)).toEqual(expected);
  });

  it('defaults a legacy producer environment with only SSM_TOKEN_PATH to aws_ssm', () => {
    expect(loadRunnerConfigStorageContextFromEnvironment({ SSM_TOKEN_PATH: '/runner/tokens' })).toEqual(ssmContext);
  });

  it('round-trips each producer environment through payload context and hook environment export', () => {
    for (const producerEnvironment of [ssmContext]) {
      const payloadContext = loadRunnerConfigStorageContextFromEnvironment(producerEnvironment);
      const hookEnvironment: Record<string, string | undefined> = {
        SSM_TOKEN_PATH: '/stale/path',
        UNRELATED: 'preserved',
      };

      const exported = exportRunnerConfigStorageEnvironment(payloadContext, hookEnvironment);
      expect(exported).toEqual(payloadContext);
      expect(loadRunnerConfigStorageContextFromEnvironment(exported)).toEqual(payloadContext);
      expect(hookEnvironment.UNRELATED).toBe('preserved');
      expect(hookEnvironment.SSM_TOKEN_PATH).toBe('/stale/path');
    }
  });

  it('does not mutate a target when context validation fails', () => {
    const target = { ...ssmContext } as Record<string, string | undefined>;

    expect(() =>
      exportRunnerConfigStorageEnvironment({ ...ssmContext, unexpected: 'forbidden' } as never, target),
    ).toThrow();
    expect(target).toEqual(ssmContext);
  });
});

describe('runner config consumer environment factory', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates an injected SSM consumer from exported environment', async () => {
    const api: AwsSsmRunnerConfigApi = {
      getParameter: vi.fn().mockResolvedValue('encoded-jit'),
      deleteParameter: vi.fn().mockResolvedValue(undefined),
    };
    const consumer = createRunnerConfigConsumerFromEnvironment(ssmContext, {
      awsSsmApi: api,
      callTimeoutMs: 100,
      configTimeoutMs: 100,
      pollIntervalMs: 1,
    });

    await expect(
      consumer.consume('microvm-123', {
        deadlineMs: Date.now() + 1_000,
        signal: new AbortController().signal,
      }),
    ).resolves.toBe('encoded-jit');
    expect(api.getParameter).toHaveBeenCalledWith('/runner/tokens/microvm-123', expect.any(AbortSignal));
    expect(api.deleteParameter).toHaveBeenCalledWith('/runner/tokens/microvm-123', expect.any(AbortSignal));
  });

  it('loads timing defaults and overrides from the supplied factory environment', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    vi.spyOn(AwsSdkSsmRunnerConfigApi.prototype, 'getParameter').mockResolvedValue(undefined);
    const consumer = createRunnerConfigConsumerFromEnvironment(
      {
        ...ssmContext,
        RUNNER_CONFIG_TIMEOUT_SECONDS: '1',
        RUNNER_CONFIG_POLL_SECONDS: '1',
      },
      undefined,
    );
    const startedAt = Date.now();
    const pending = consumer.consume('microvm-123', {
      deadlineMs: startedAt + 10_000,
      signal: new AbortController().signal,
    });
    const rejection = expect(pending).rejects.toThrow(
      'runner configuration did not become available before the deadline',
    );

    await vi.runAllTimersAsync();

    await rejection;
    expect(Date.now() - startedAt).toBe(1_000);
  });

  it('loads source-compatible timing defaults', () => {
    expect(loadRunnerConfigConsumerConfigFromEnvironment({})).toEqual({
      callTimeoutMs: 5_000,
      configTimeoutMs: 20_000,
      deleteAttempts: 3,
      pollIntervalMs: 2_000,
    });
  });

  it('loads bounded timing overrides from an environment', () => {
    expect(
      loadRunnerConfigConsumerConfigFromEnvironment({
        AWS_SDK_CALL_TIMEOUT_SECONDS: '7',
        RUNNER_CONFIG_TIMEOUT_SECONDS: '31',
        RUNNER_CONFIG_DELETE_ATTEMPTS: '4',
        RUNNER_CONFIG_POLL_SECONDS: '3',
      }),
    ).toEqual({
      callTimeoutMs: 7_000,
      configTimeoutMs: 31_000,
      deleteAttempts: 4,
      pollIntervalMs: 3_000,
    });
  });

  it.each([
    ['AWS_SDK_CALL_TIMEOUT_SECONDS', '0', 'callTimeoutMs', 5_000],
    ['RUNNER_CONFIG_TIMEOUT_SECONDS', '61', 'configTimeoutMs', 20_000],
    ['RUNNER_CONFIG_DELETE_ATTEMPTS', '11', 'deleteAttempts', 3],
    ['RUNNER_CONFIG_POLL_SECONDS', 'not-a-number', 'pollIntervalMs', 2_000],
  ])('falls back for invalid %s=%j', (name, value, property, expected) => {
    expect(loadRunnerConfigConsumerConfigFromEnvironment({ [name]: value })).toHaveProperty(property, expected);
  });
});

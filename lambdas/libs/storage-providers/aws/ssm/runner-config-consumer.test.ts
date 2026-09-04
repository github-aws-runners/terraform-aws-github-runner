import { DeleteParameterCommand, GetParameterCommand, type SSMClient } from '@aws-sdk/client-ssm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AwsSdkSsmRunnerConfigApi,
  createAwsSsmRunnerConfigConsumer,
  type AwsSsmRunnerConfigApi,
} from './runner-config-consumer';

function namedError(name: string, message = 'provider detail'): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

describe('AWS SDK SSM runner config API', () => {
  it('decrypts the parameter and deletes it with the caller abort signal', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Parameter: { Value: 'encoded-jit' } })
      .mockResolvedValueOnce({});
    const api = new AwsSdkSsmRunnerConfigApi({ send } as unknown as SSMClient);
    const signal = new AbortController().signal;

    await expect(api.getParameter('/runner/tokens/runner-123', signal)).resolves.toBe('encoded-jit');
    await expect(api.deleteParameter('/runner/tokens/runner-123', signal)).resolves.toBeUndefined();

    expect(send.mock.calls[0][0]).toBeInstanceOf(GetParameterCommand);
    expect(send.mock.calls[0][0].input).toEqual({
      Name: '/runner/tokens/runner-123',
      WithDecryption: true,
    });
    expect(send.mock.calls[0][1]).toEqual({ abortSignal: signal });
    expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteParameterCommand);
    expect(send.mock.calls[1][0].input).toEqual({ Name: '/runner/tokens/runner-123' });
    expect(send.mock.calls[1][1]).toEqual({ abortSignal: signal });
  });
});

describe('SSM runner config consumer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls a missing parameter, reads it, and deletes it before returning', async () => {
    const getParameter = vi
      .fn<AwsSsmRunnerConfigApi['getParameter']>()
      .mockRejectedValueOnce(namedError('ParameterNotFound'))
      .mockResolvedValueOnce('encoded-jit');
    const deleteParameter = vi.fn<AwsSsmRunnerConfigApi['deleteParameter']>().mockResolvedValue(undefined);
    const consumer = createAwsSsmRunnerConfigConsumer(
      { RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm', SSM_TOKEN_PATH: '/runner/tokens' },
      {
        api: { getParameter, deleteParameter },
        callTimeoutMs: 100,
        configTimeoutMs: 500,
        pollIntervalMs: 1,
      },
    );

    await expect(
      consumer.consume('runner-123', {
        deadlineMs: Date.now() + 1_000,
        signal: new AbortController().signal,
      }),
    ).resolves.toBe('encoded-jit');
    expect(getParameter).toHaveBeenCalledTimes(2);
    expect(deleteParameter).toHaveBeenCalledOnce();
    expect(deleteParameter).toHaveBeenCalledWith('/runner/tokens/runner-123', expect.any(AbortSignal));
  });

  it('retries a transient delete failure without returning the value early', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const api: AwsSsmRunnerConfigApi = {
      getParameter: vi.fn().mockResolvedValue('encoded-jit'),
      deleteParameter: vi
        .fn()
        .mockRejectedValueOnce(namedError('ThrottlingException'))
        .mockResolvedValueOnce(undefined),
    };
    const consumer = createAwsSsmRunnerConfigConsumer(
      { RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm', SSM_TOKEN_PATH: '/runner/tokens' },
      { api, callTimeoutMs: 100, configTimeoutMs: 2_000, deleteAttempts: 2, pollIntervalMs: 1 },
    );

    const pending = consumer.consume('runner-123', {
      deadlineMs: Date.now() + 3_000,
      signal: new AbortController().signal,
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBe('encoded-jit');
    expect(api.deleteParameter).toHaveBeenCalledTimes(2);
  });

  it('fails closed when another reader deletes the SSM parameter first', async () => {
    const api: AwsSsmRunnerConfigApi = {
      getParameter: vi.fn().mockResolvedValue('encoded-jit'),
      deleteParameter: vi.fn().mockRejectedValue(namedError('ParameterNotFound')),
    };
    const consumer = createAwsSsmRunnerConfigConsumer(
      { RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm', SSM_TOKEN_PATH: '/runner/tokens' },
      { api, callTimeoutMs: 100, configTimeoutMs: 100, deleteAttempts: 3, pollIntervalMs: 1 },
    );

    await expect(
      consumer.consume('runner-123', {
        deadlineMs: Date.now() + 1_000,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('runner configuration could not be deleted from SSM');
    expect(api.deleteParameter).toHaveBeenCalledOnce();
  });

  it('sanitizes non-retryable provider failures', async () => {
    const api: AwsSsmRunnerConfigApi = {
      getParameter: vi.fn().mockRejectedValue(namedError('AccessDeniedException', 'encoded-jit-secret')),
      deleteParameter: vi.fn(),
    };
    const consumer = createAwsSsmRunnerConfigConsumer(
      { RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm', SSM_TOKEN_PATH: '/runner/tokens' },
      { api, callTimeoutMs: 100, configTimeoutMs: 100, pollIntervalMs: 1 },
    );

    const pending = consumer.consume('runner-123', {
      deadlineMs: Date.now() + 1_000,
      signal: new AbortController().signal,
    });
    await expect(pending).rejects.toThrow('failed to read runner configuration from SSM');
    await expect(pending).rejects.not.toThrow('encoded-jit-secret');
    expect(api.deleteParameter).not.toHaveBeenCalled();
  });

  it('rejects an empty SSM parameter value without attempting deletion', async () => {
    const api: AwsSsmRunnerConfigApi = {
      getParameter: vi.fn().mockResolvedValue(''),
      deleteParameter: vi.fn(),
    };
    const consumer = createAwsSsmRunnerConfigConsumer(
      { RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm', SSM_TOKEN_PATH: '/runner/tokens' },
      { api, callTimeoutMs: 100, configTimeoutMs: 100, pollIntervalMs: 1 },
    );

    await expect(
      consumer.consume('runner-123', {
        deadlineMs: Date.now() + 1_000,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('failed to read runner configuration from SSM');
    expect(api.deleteParameter).not.toHaveBeenCalled();
  });

  it('validates the full parameter name before calling SSM', async () => {
    const api: AwsSsmRunnerConfigApi = {
      getParameter: vi.fn(),
      deleteParameter: vi.fn(),
    };
    const consumer = createAwsSsmRunnerConfigConsumer(
      { RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm', SSM_TOKEN_PATH: `/${'x'.repeat(890)}` },
      { api, callTimeoutMs: 100, configTimeoutMs: 100, pollIntervalMs: 1 },
    );

    await expect(
      consumer.consume('runner-1234567890', {
        deadlineMs: Date.now() + 1_000,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('aws_ssm runner configuration key is invalid');
    expect(api.getParameter).not.toHaveBeenCalled();
  });

  it('stops a provider call immediately when the caller aborts', async () => {
    const api: AwsSsmRunnerConfigApi = {
      getParameter: vi.fn().mockReturnValue(new Promise(() => undefined)),
      deleteParameter: vi.fn(),
    };
    const controller = new AbortController();
    const consumer = createAwsSsmRunnerConfigConsumer(
      { RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm', SSM_TOKEN_PATH: '/runner/tokens' },
      { api, callTimeoutMs: 10_000, configTimeoutMs: 10_000, pollIntervalMs: 1 },
    );
    const pending = consumer.consume('runner-123', {
      deadlineMs: Date.now() + 10_000,
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toThrow('runner configuration consumption was cancelled');
  });

  it('reserves a bounded delete attempt when the value appears near the polling deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const startedAt = Date.now();
    let deleteStartedAt: number | undefined;
    const api: AwsSsmRunnerConfigApi = {
      getParameter: vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce('encoded-jit'),
      deleteParameter: vi.fn().mockImplementation(async () => {
        deleteStartedAt = Date.now();
      }),
    };
    const consumer = createAwsSsmRunnerConfigConsumer(
      { RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm', SSM_TOKEN_PATH: '/runner/tokens' },
      { api, callTimeoutMs: 100, configTimeoutMs: 1_000, pollIntervalMs: 99 },
    );

    const pending = consumer.consume('runner-123', {
      deadlineMs: startedAt + 200,
      signal: new AbortController().signal,
    });
    await vi.runAllTimersAsync();

    await expect(pending).resolves.toBe('encoded-jit');
    expect(api.getParameter).toHaveBeenCalledTimes(2);
    expect(deleteStartedAt).toBe(startedAt + 99);
    expect(deleteStartedAt).toBeLessThanOrEqual(startedAt + 100);
  });
});

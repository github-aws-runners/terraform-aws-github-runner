import { DeleteParametersCommand, GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('./logger', async (importOriginal) => {
  const original = await importOriginal<typeof import('./logger')>();
  return {
    ...original,
    createAwsSsmStorageLogger: () => ({ info: vi.fn(), debug: vi.fn(), warn, error: vi.fn() }),
  };
});

import { cleanSSMTokens } from './runner-config-housekeeper';

const mockSSMClient = mockClient(SSMClient);
const tokenPath = '/path/to/tokens/';
const now = new Date('2026-09-23T12:00:00Z');
const old = new Date('2026-09-21T12:00:00Z');
const options = { dryRun: false, minimumDaysOld: 1, tokenPath };
const staleParameters = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ Name: `${tokenPath}i-${i}`, LastModifiedDate: old }));

function mockPages(count: number) {
  const parameters = staleParameters(count);
  mockSSMClient.on(GetParametersByPathCommand).callsFake((input) => {
    const offset = Number(input.NextToken ?? 0);
    return {
      Parameters: parameters.slice(offset, offset + 10),
      NextToken: offset + 10 < count ? String(offset + 10) : undefined,
    };
  });
}

async function clean(overrides = {}, remainingTime?: () => number) {
  const cleanup = cleanSSMTokens({ ...options, ...overrides }, remainingTime);
  await vi.runAllTimersAsync();
  await cleanup;
}

describe('clean SSM tokens / JIT config', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    warn.mockClear();
    mockSSMClient.reset();
    mockSSMClient.on(GetParametersByPathCommand).resolves({ Parameters: staleParameters(1) });
    mockSSMClient.on(DeleteParametersCommand).resolves({});
  });
  afterEach(() => vi.useRealTimers());

  it.each([1, 10, 11, 25])('deletes %i stale parameters in batches of at most ten', async (count) => {
    const parameters = staleParameters(count);
    mockPages(count);
    await clean();
    const batches = mockSSMClient.commandCalls(DeleteParametersCommand).map((call) => call.args[0].input.Names!);
    expect(batches.map((batch) => batch.length)).toEqual(
      Array.from({ length: Math.ceil(count / 10) }, (_, i) => Math.min(10, count - i * 10)),
    );
    expect(batches.flat()).toEqual(parameters.map((parameter) => parameter.Name));
    for (const call of mockSSMClient.commandCalls(GetParametersByPathCommand)) {
      expect(call.args[0].input.MaxResults).toBe(10);
    }
  });

  it('filters young, boundary-age and incomplete parameters across listing pages', async () => {
    mockSSMClient
      .on(GetParametersByPathCommand)
      .resolvesOnce({
        Parameters: [
          ...staleParameters(1),
          { Name: 'young', LastModifiedDate: now },
          { Name: 'boundary', LastModifiedDate: new Date('2026-09-22T12:00:00Z') },
          { Name: 'missing-date' },
          { LastModifiedDate: old },
        ],
        NextToken: 'next',
      })
      .resolvesOnce({ Parameters: [{ Name: 'old-on-second-page', LastModifiedDate: old }] });
    await clean();
    expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersByPathCommand, { Path: tokenPath, NextToken: 'next' });
    expect(mockSSMClient).toHaveReceivedCommandTimes(DeleteParametersCommand, 2);
    expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParametersCommand, { Names: [`${tokenPath}i-0`] });
    expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParametersCommand, { Names: ['old-on-second-page'] });
  });

  it('does not delete in dry-run mode', async () => {
    await clean({ dryRun: true });
    expect(mockSSMClient).toHaveReceivedCommandTimes(DeleteParametersCommand, 0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([undefined, [], [{ Name: 'young', LastModifiedDate: now }]])(
    'does not send an empty delete request (%j)',
    async (Parameters) => {
      mockSSMClient.on(GetParametersByPathCommand).resolves({ Parameters });
      await clean();
      expect(mockSSMClient).toHaveReceivedCommandTimes(DeleteParametersCommand, 0);
    },
  );

  it('paces successive batch requests', async () => {
    mockPages(11);
    const cleanup = cleanSSMTokens(options);
    await vi.advanceTimersByTimeAsync(349);
    expect(mockSSMClient).toHaveReceivedCommandTimes(DeleteParametersCommand, 0);
    await vi.advanceTimersByTimeAsync(1);
    expect(mockSSMClient).toHaveReceivedCommandTimes(DeleteParametersCommand, 1);
    await vi.advanceTimersByTimeAsync(349);
    expect(mockSSMClient).toHaveReceivedCommandTimes(DeleteParametersCommand, 1);
    await vi.advanceTimersByTimeAsync(1);
    await cleanup;
    expect(mockSSMClient).toHaveReceivedCommandTimes(DeleteParametersCommand, 2);
  });

  it('logs an exhausted batch failure and continues to later batches', async () => {
    mockPages(11);
    mockSSMClient.on(DeleteParametersCommand).rejectsOnce(new Error('Rate exceeded')).resolves({});
    await clean();
    expect(warn).toHaveBeenCalledWith('Failed to delete expired runner configuration batch', {
      parameterNames: staleParameters(10).map((parameter) => parameter.Name),
      errorNames: ['Error'],
    });
    expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParametersCommand, { Names: [`${tokenPath}i-10`] });
  });

  it('reports invalid names in a successful response and continues cleanup', async () => {
    mockPages(11);
    mockSSMClient
      .on(DeleteParametersCommand)
      .resolvesOnce({
        DeletedParameters: staleParameters(9).map((parameter) => parameter.Name),
        InvalidParameters: [`${tokenPath}i-9`],
      })
      .resolves({});
    await clean();
    expect(warn).toHaveBeenCalledWith('Runner configurations were not deleted', {
      parameterNames: [`${tokenPath}i-9`],
    });
    expect(mockSSMClient).toHaveReceivedCommandTimes(DeleteParametersCommand, 2);
  });

  it.each([undefined, []])('follows tokens through empty pages (%j)', async (Parameters) => {
    mockSSMClient
      .on(GetParametersByPathCommand)
      .resolvesOnce({ Parameters, NextToken: 'empty' })
      .resolvesOnce({ NextToken: 'last' })
      .resolvesOnce({ Parameters: staleParameters(1) });
    await clean();
    expect(mockSSMClient).toHaveReceivedCommandTimes(GetParametersByPathCommand, 3);
    expect(mockSSMClient).toHaveReceivedCommandWith(GetParametersByPathCommand, { NextToken: 'last' });
    expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParametersCommand, { Names: [`${tokenPath}i-0`] });
  });

  it('deletes the current page before fetching the next page, even if that listing fails', async () => {
    mockSSMClient
      .on(GetParametersByPathCommand)
      .resolvesOnce({ Parameters: staleParameters(1), NextToken: 'next' })
      .callsFake(() => {
        expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParametersCommand, { Names: [`${tokenPath}i-0`] });
        throw new Error('Later listing failed');
      });
    const result = expect(cleanSSMTokens(options)).rejects.toThrow('Later listing failed');
    await vi.runAllTimersAsync();
    await result;
  });

  it('does not start listing with less than ten seconds remaining', async () => {
    await clean({}, () => 9999);
    expect(mockSSMClient.calls()).toHaveLength(0);
  });

  it('does not delete when listing consumes the remaining time', async () => {
    let remaining = 60000;
    mockSSMClient.on(GetParametersByPathCommand).callsFake(() => {
      remaining = 9999;
      return { Parameters: staleParameters(1), NextToken: 'next' };
    });
    await clean({}, () => remaining);
    expect(mockSSMClient).toHaveReceivedCommandTimes(GetParametersByPathCommand, 1);
    expect(mockSSMClient).toHaveReceivedCommandTimes(DeleteParametersCommand, 0);
  });

  it('checks the remaining time again after the pacing delay', async () => {
    const deadline = now.getTime() + 10300;
    await clean({}, () => deadline - Date.now());
    expect(mockSSMClient).toHaveReceivedCommandTimes(DeleteParametersCommand, 0);
  });

  it('starts a fresh scan of remaining parameters after stopping between pages', async () => {
    let remaining = 60000;
    let inventory = staleParameters(11);
    mockSSMClient.on(GetParametersByPathCommand).callsFake(() => ({
      Parameters: inventory.slice(0, 10),
      NextToken: inventory.length > 10 ? 'next' : undefined,
    }));
    mockSSMClient.on(DeleteParametersCommand).callsFake((input) => {
      inventory = inventory.filter((parameter) => !input.Names.includes(parameter.Name));
      remaining = 0;
      return {};
    });
    await clean({}, () => remaining);
    expect(inventory.map((parameter) => parameter.Name)).toEqual([`${tokenPath}i-10`]);
    expect(mockSSMClient).toHaveReceivedCommandTimes(GetParametersByPathCommand, 1);
    mockSSMClient.resetHistory();
    await clean();
    expect(mockSSMClient.commandCalls(GetParametersByPathCommand)[0].args[0].input.NextToken).toBeUndefined();
    expect(mockSSMClient).toHaveReceivedCommandWith(DeleteParametersCommand, { Names: [`${tokenPath}i-10`] });
    expect(inventory).toHaveLength(0);
  });

  it('propagates listing failures without deleting', async () => {
    mockSSMClient.on(GetParametersByPathCommand).rejects(new Error('Listing failed'));
    await expect(cleanSSMTokens(options)).rejects.toThrow('Listing failed');
    expect(mockSSMClient).toHaveReceivedCommandTimes(DeleteParametersCommand, 0);
  });

  it.each([{ minimumDaysOld: 0 }, { minimumDaysOld: undefined }, { tokenPath: undefined }])(
    'rejects invalid cleanup options (%j)',
    async (invalid) => {
      await expect(cleanSSMTokens({ ...options, ...invalid } as typeof options)).rejects.toThrow();
      expect(mockSSMClient.calls()).toHaveLength(0);
    },
  );
});

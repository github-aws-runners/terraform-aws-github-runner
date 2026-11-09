import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ec2PoolStandbyOperations } from '../standby-types';
import { processStopEvents } from './stop-events';

const markPrimed = vi.fn<Ec2PoolStandbyOperations['markPrimed']>();
const OBSERVED_AT = new Date('2026-10-05T15:45:00.000Z');

function event(id: string, detail: object | string, time?: string) {
  return { id, body: typeof detail === 'string' ? detail : JSON.stringify({ source: 'aws.ec2', time, detail }) };
}

const stopped = (instanceId: string) => ({ 'instance-id': instanceId, state: 'stopped' });

describe('processStopEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: OBSERVED_AT, toFake: ['Date'] });
    markPrimed.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marks every stopped instance of the batch in one call', async () => {
    await expect(
      processStopEvents({ markPrimed }, [
        event('m1', stopped('i-1')),
        event('m2', stopped('i-2')),
        event('m3', stopped('i-1')),
      ]),
    ).resolves.toEqual([]);

    expect(markPrimed).toHaveBeenCalledTimes(1);
    expect(markPrimed).toHaveBeenCalledWith([
      { instanceId: 'i-1', warmSince: OBSERVED_AT.toISOString() },
      { instanceId: 'i-2', warmSince: OBSERVED_AT.toISOString() },
    ]);
  });

  it('uses the EventBridge stop-transition timestamp when available', async () => {
    await processStopEvents({ markPrimed }, [event('m1', stopped('i-1'), '2026-10-05T15:40:00.000Z')]);

    expect(markPrimed).toHaveBeenCalledWith([{ instanceId: 'i-1', warmSince: '2026-10-05T15:40:00.000Z' }]);
  });

  it('uses the latest duplicate transition timestamp and retries all matching messages', async () => {
    markPrimed.mockResolvedValue(['i-1']);

    await expect(
      processStopEvents({ markPrimed }, [
        event('early', stopped('i-1'), '2026-10-05T15:40:00.000Z'),
        event('late', stopped('i-1'), '2026-10-05T15:42:00.000Z'),
      ]),
    ).resolves.toEqual(['early', 'late']);

    expect(markPrimed).toHaveBeenCalledWith([{ instanceId: 'i-1', warmSince: '2026-10-05T15:42:00.000Z' }]);
  });

  it('retries only the events of instances whose index write failed', async () => {
    markPrimed.mockResolvedValue(['i-1']);

    await expect(
      processStopEvents({ markPrimed }, [
        event('m1', stopped('i-1')),
        event('m2', stopped('i-2')),
        event('m3', stopped('i-1')),
      ]),
    ).resolves.toEqual(['m1', 'm3']);
  });

  it('retries the whole batch when the instances cannot be read', async () => {
    markPrimed.mockRejectedValue(new Error('RequestLimitExceeded'));

    await expect(
      processStopEvents({ markPrimed }, [event('m1', stopped('i-1')), event('m2', stopped('i-2'))]),
    ).resolves.toEqual(['m1', 'm2']);
  });

  it('ignores other states and malformed events without reading instances', async () => {
    await expect(
      processStopEvents({ markPrimed }, [
        event('m1', { 'instance-id': 'i-1', state: 'running' }),
        event('m2', 'not json'),
      ]),
    ).resolves.toEqual([]);

    expect(markPrimed).not.toHaveBeenCalled();
  });
});

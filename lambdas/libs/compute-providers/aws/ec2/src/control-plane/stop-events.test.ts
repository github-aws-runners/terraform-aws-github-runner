import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Ec2PoolStandbyOperations } from '../standby-types';
import { processStopEvents } from './stop-events';

const markPrimed = vi.fn<Ec2PoolStandbyOperations['markPrimed']>();

function event(id: string, detail: object | string) {
  return { id, body: typeof detail === 'string' ? detail : JSON.stringify({ source: 'aws.ec2', detail }) };
}

const stopped = (instanceId: string) => ({ 'instance-id': instanceId, state: 'stopped' });

describe('processStopEvents', () => {
  beforeEach(() => {
    markPrimed.mockReset().mockResolvedValue([]);
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
    expect(markPrimed).toHaveBeenCalledWith(['i-1', 'i-2']);
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

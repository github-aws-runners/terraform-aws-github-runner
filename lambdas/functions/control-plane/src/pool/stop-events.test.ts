import type { SQSRecord } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { controlPlaneProviderRegistry } from '../control-plane-providers';
import type { PoolStandbyOperations } from './pool-provider';
import { markPrimedFromStopEvents } from './stop-events';

const markPrimed = vi.fn<NonNullable<PoolStandbyOperations['markPrimed']>>();
const mockedCapability = vi.spyOn(controlPlaneProviderRegistry, 'capability');

function record(messageId: string, detail: object | string): SQSRecord {
  const body = typeof detail === 'string' ? detail : JSON.stringify({ source: 'aws.ec2', detail });
  return { messageId, body } as SQSRecord;
}

const stopped = (instanceId: string) => ({ 'instance-id': instanceId, state: 'stopped' });

describe('markPrimedFromStopEvents', () => {
  beforeEach(() => {
    markPrimed.mockReset().mockResolvedValue([]);
    mockedCapability.mockReturnValue(() => ({ standby: { markPrimed } }) as never);
  });

  it('marks every stopped instance of the batch in one call', async () => {
    await expect(
      markPrimedFromStopEvents([
        record('m1', stopped('i-1')),
        record('m2', stopped('i-2')),
        record('m3', stopped('i-1')),
      ]),
    ).resolves.toEqual([]);

    expect(markPrimed).toHaveBeenCalledTimes(1);
    expect(markPrimed).toHaveBeenCalledWith(['i-1', 'i-2']);
  });

  it('retries only the messages of instances whose index write failed', async () => {
    markPrimed.mockResolvedValue(['i-1']);

    await expect(
      markPrimedFromStopEvents([
        record('m1', stopped('i-1')),
        record('m2', stopped('i-2')),
        record('m3', stopped('i-1')),
      ]),
    ).resolves.toEqual([{ itemIdentifier: 'm1' }, { itemIdentifier: 'm3' }]);
  });

  it('retries the whole batch when the instances cannot be read', async () => {
    markPrimed.mockRejectedValue(new Error('RequestLimitExceeded'));

    await expect(
      markPrimedFromStopEvents([record('m1', stopped('i-1')), record('m2', stopped('i-2'))]),
    ).resolves.toEqual([{ itemIdentifier: 'm1' }, { itemIdentifier: 'm2' }]);
  });

  it('ignores other states and malformed messages without calling the provider', async () => {
    await expect(
      markPrimedFromStopEvents([record('m1', { 'instance-id': 'i-1', state: 'running' }), record('m2', 'not json')]),
    ).resolves.toEqual([]);

    expect(markPrimed).not.toHaveBeenCalled();
  });

  it('fails when the compute provider cannot mark primed instances', async () => {
    mockedCapability.mockReturnValue(() => ({ standby: {} }) as never);

    await expect(markPrimedFromStopEvents([record('m1', stopped('i-1'))])).rejects.toThrow(
      'cannot mark primed warm instances',
    );
  });
});

import type { SQSRecord } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { controlPlaneProviderRegistry } from '../control-plane-providers';
import type { PoolStandbyCapability } from './pool-provider';
import { processStandbyEvents } from './stop-events';

const processEvents = vi.fn<NonNullable<PoolStandbyCapability['processEvents']>>();
const mockedCapability = vi.spyOn(controlPlaneProviderRegistry, 'capability');

const record = (messageId: string, body: string) => ({ messageId, body }) as SQSRecord;

describe('processStandbyEvents', () => {
  beforeEach(() => {
    processEvents.mockReset().mockResolvedValue([]);
    mockedCapability.mockClear().mockReturnValue(() => ({ standby: { processEvents } }) as never);
  });

  it('passes the batch to the compute provider as events', async () => {
    await expect(processStandbyEvents([record('m1', 'body-1'), record('m2', 'body-2')])).resolves.toEqual([]);

    expect(processEvents).toHaveBeenCalledWith([
      { id: 'm1', body: 'body-1' },
      { id: 'm2', body: 'body-2' },
    ]);
  });

  it('reports the events the provider failed as batch item failures', async () => {
    processEvents.mockResolvedValue(['m2']);

    await expect(processStandbyEvents([record('m1', 'body-1'), record('m2', 'body-2')])).resolves.toEqual([
      { itemIdentifier: 'm2' },
    ]);
  });

  it('does not resolve the provider for an empty batch', async () => {
    await expect(processStandbyEvents([])).resolves.toEqual([]);

    expect(mockedCapability).not.toHaveBeenCalled();
  });

  it('fails when the compute provider cannot process standby events', async () => {
    mockedCapability.mockReturnValue(() => ({ standby: { reconcile: vi.fn() } }) as never);

    await expect(processStandbyEvents([record('m1', 'body-1')])).rejects.toThrow('cannot process standby events');
  });
});

import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import type { StandbyEvent } from '../../../../core';
import type { Ec2PoolStandbyOperations } from '../standby-types';

const logger = createChildLogger('warm-pool-stop-events');

interface InstanceStateChangeEvent {
  detail?: { 'instance-id'?: string; state?: string };
}

function stoppedInstanceId(event: StandbyEvent): string | undefined {
  try {
    const parsed = JSON.parse(event.body) as InstanceStateChangeEvent;
    return parsed.detail?.state === 'stopped' ? parsed.detail['instance-id'] : undefined;
  } catch {
    logger.warn('Ignoring a stop event that is not valid JSON.', { eventId: event.id });
    return undefined;
  }
}

// Anything missed here is classified by the next scheduled pool run, so only index write failures are retried.
export async function processStopEvents(
  standby: Pick<Ec2PoolStandbyOperations, 'markPrimed'>,
  events: StandbyEvent[],
): Promise<string[]> {
  const eventsByInstance = new Map<string, string[]>();
  for (const event of events) {
    const instanceId = stoppedInstanceId(event);
    if (instanceId) eventsByInstance.set(instanceId, [...(eventsByInstance.get(instanceId) ?? []), event.id]);
  }
  if (eventsByInstance.size === 0) return [];

  let failed: string[];
  try {
    failed = await standby.markPrimed([...eventsByInstance.keys()]);
  } catch (error) {
    logger.warn('Failed to read the stopped instances, retrying the batch.', {
      error: error instanceof Error ? error.message : String(error),
    });
    failed = [...eventsByInstance.keys()];
  }
  return failed.flatMap((instanceId) => eventsByInstance.get(instanceId) ?? []);
}

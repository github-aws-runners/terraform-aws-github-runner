import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import type { StandbyEvent } from '../../../../core';
import type { Ec2PoolStandbyOperations } from '../standby-types';

const logger = createChildLogger('warm-pool-stop-events');

interface InstanceStateChangeEvent {
  time?: string;
  detail?: { 'instance-id'?: string; state?: string };
}

interface StoppedInstance {
  instanceId: string;
  warmSince: string;
}

function stoppedInstance(event: StandbyEvent): StoppedInstance | undefined {
  try {
    const parsed = JSON.parse(event.body) as InstanceStateChangeEvent;
    const instanceId = parsed.detail?.state === 'stopped' ? parsed.detail['instance-id'] : undefined;
    if (!instanceId) return undefined;
    const eventTime = Date.parse(parsed.time ?? '');
    return {
      instanceId,
      warmSince: Number.isNaN(eventTime) ? new Date().toISOString() : new Date(eventTime).toISOString(),
    };
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
  const eventsByInstance = new Map<string, { warmSince: string; eventIds: string[] }>();
  for (const event of events) {
    const stopped = stoppedInstance(event);
    if (!stopped) continue;
    const existing = eventsByInstance.get(stopped.instanceId);
    if (existing) {
      if (Date.parse(stopped.warmSince) > Date.parse(existing.warmSince)) existing.warmSince = stopped.warmSince;
      existing.eventIds.push(event.id);
    } else {
      eventsByInstance.set(stopped.instanceId, { warmSince: stopped.warmSince, eventIds: [event.id] });
    }
  }
  if (eventsByInstance.size === 0) return [];

  let failed: string[];
  try {
    failed = await standby.markPrimed(
      [...eventsByInstance].map(([instanceId, { warmSince }]) => ({ instanceId, warmSince })),
    );
  } catch (error) {
    logger.warn('Failed to read the stopped instances, retrying the batch.', {
      error: error instanceof Error ? error.message : String(error),
    });
    failed = [...eventsByInstance.keys()];
  }
  return failed.flatMap((instanceId) => eventsByInstance.get(instanceId)?.eventIds ?? []);
}

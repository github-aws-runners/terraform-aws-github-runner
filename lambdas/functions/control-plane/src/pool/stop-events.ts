import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { resolveComputeProviderType } from '@aws-github-runner/compute-providers/provider-types';
import type { SQSBatchItemFailure, SQSRecord } from 'aws-lambda';

import { controlPlaneProviderRegistry } from '../control-plane-providers';

const logger = createChildLogger('warm-pool-stop-events');

interface InstanceStateChangeEvent {
  detail?: { 'instance-id'?: string; state?: string };
}

function stoppedInstanceId(record: SQSRecord): string | undefined {
  try {
    const event = JSON.parse(record.body) as InstanceStateChangeEvent;
    return event.detail?.state === 'stopped' ? event.detail['instance-id'] : undefined;
  } catch {
    logger.warn('Ignoring a stop event that is not valid JSON.', { messageId: record.messageId });
    return undefined;
  }
}

// Anything missed here is classified by the next scheduled pool run, so only index write failures are retried.
export async function markPrimedFromStopEvents(records: SQSRecord[]): Promise<SQSBatchItemFailure[]> {
  const messagesByInstance = new Map<string, string[]>();
  for (const record of records) {
    const instanceId = stoppedInstanceId(record);
    if (instanceId)
      messagesByInstance.set(instanceId, [...(messagesByInstance.get(instanceId) ?? []), record.messageId]);
  }
  if (messagesByInstance.size === 0) return [];

  const markPrimed = controlPlaneProviderRegistry.capability(resolveComputeProviderType(undefined), 'pool')().standby
    ?.markPrimed;
  if (!markPrimed) throw new Error('The compute provider cannot mark primed warm instances.');

  let failed: string[];
  try {
    failed = await markPrimed([...messagesByInstance.keys()]);
  } catch (error) {
    logger.warn('Failed to read the stopped instances, retrying the batch.', {
      error: error instanceof Error ? error.message : String(error),
    });
    failed = [...messagesByInstance.keys()];
  }
  return failed.flatMap((instanceId) =>
    (messagesByInstance.get(instanceId) ?? []).map((itemIdentifier) => ({ itemIdentifier })),
  );
}

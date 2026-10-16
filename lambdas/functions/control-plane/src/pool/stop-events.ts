import { resolveComputeProviderType } from '@aws-github-runner/compute-providers/provider-types';
import type { SQSBatchItemFailure, SQSRecord } from 'aws-lambda';

import { controlPlaneProviderRegistry } from '../control-plane-providers';

export async function processStandbyEvents(records: SQSRecord[]): Promise<SQSBatchItemFailure[]> {
  if (records.length === 0) return [];

  const computeProviderType = resolveComputeProviderType(undefined);
  const processEvents = controlPlaneProviderRegistry.capability(computeProviderType, 'pool')().standby?.processEvents;
  if (!processEvents) throw new Error(`Compute provider '${computeProviderType}' cannot process standby events.`);

  const failed = await processEvents(records.map(({ messageId, body }) => ({ id: messageId, body })));
  return failed.map((itemIdentifier) => ({ itemIdentifier }));
}

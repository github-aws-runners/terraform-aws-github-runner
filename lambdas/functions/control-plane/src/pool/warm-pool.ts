import { createChildLogger, createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import yn from 'yn';

import type { PoolComputeProvider, StandbyReconcileResult } from './pool-provider';

const logger = createChildLogger('warm-pool');

export function isWarmPoolEnabled(): boolean {
  return yn(process.env.WARM_POOL_ENABLED, { default: false });
}

export async function adjustWarmPool(
  computeProvider: Pick<PoolComputeProvider, 'type' | 'standby'>,
  poolSize: number,
): Promise<void> {
  const standby = computeProvider.standby;
  if (!standby) {
    throw new Error(`Compute provider '${computeProvider.type}' does not support a warm pool.`);
  }
  logger.info(`Checking current ${computeProvider.type} warm pool against pool of size: ${poolSize}`);

  const environment = process.env.ENVIRONMENT;
  const result = await standby.reconcile({
    environment,
    desiredSize: poolSize,
    maxAgeHours: parseInt(process.env.WARM_POOL_MAX_AGE_HOURS || '168'),
    bootTimeoutMinutes: parseInt(process.env.RUNNER_BOOT_TIME_IN_MINUTES || '5'),
  });
  logger.info('Reconciled the warm pool.', { ...result });

  publishWarmPoolMetrics(environment, result);
}

function publishWarmPoolMetrics(environment: string, result: StandbyReconcileResult): void {
  if (!yn(process.env.ENABLE_METRIC_WARM_POOL, { default: false })) return;
  const dimensions = { Environment: environment };
  createSingleMetric('WarmPoolWarmInstances', MetricUnit.Count, result.ready, dimensions);
  createSingleMetric('WarmPoolPrimingInstances', MetricUnit.Count, result.preparing, dimensions);
  for (const [reason, count] of Object.entries(result.evictions)) {
    createSingleMetric('WarmPoolEvictions', MetricUnit.Count, count, { ...dimensions, Reason: reason });
  }
  const errorsByOperation = new Map<string, number>();
  for (const { operation } of result.errors) {
    errorsByOperation.set(operation, (errorsByOperation.get(operation) ?? 0) + 1);
  }
  for (const [operation, count] of errorsByOperation) {
    createSingleMetric('WarmPoolReconcileErrors', MetricUnit.Count, count, { ...dimensions, Operation: operation });
  }
}

import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PoolStandbyCapability, StandbyReconcileResult } from './pool-provider';
import { adjustWarmPool } from './warm-pool';

vi.mock('@aws-github-runner/aws-powertools-util', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-github-runner/aws-powertools-util')>()),
  createSingleMetric: vi.fn(),
}));

const ENVIRONMENT = 'unit-test-environment';
const reconcile = vi.fn<PoolStandbyCapability['reconcile']>();
const provider = { type: 'aws-ec2', standby: { reconcile } };
const emptyResult: StandbyReconcileResult = { ready: 0, preparing: 0, launched: 0, evictions: {}, errors: [] };

const cleanEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
  process.env.ENVIRONMENT = ENVIRONMENT;
  delete process.env.WARM_POOL_MAX_AGE_HOURS;
  delete process.env.RUNNER_BOOT_TIME_IN_MINUTES;
  delete process.env.ENABLE_METRIC_WARM_POOL;
  reconcile.mockResolvedValue(emptyResult);
});

describe('adjustWarmPool', () => {
  it('throws when the provider has no standby capability', async () => {
    await expect(adjustWarmPool({ type: 'aws-ec2' }, 2)).rejects.toThrow(
      "Compute provider 'aws-ec2' does not support a warm pool.",
    );
  });

  it('reconciles towards the pool size with the default max age and boot time', async () => {
    await adjustWarmPool(provider, 2);

    expect(reconcile).toHaveBeenCalledWith({
      environment: ENVIRONMENT,
      desiredSize: 2,
      maxAgeHours: 168,
      bootTimeoutMinutes: 5,
    });
  });

  it('passes the configured max age and boot time', async () => {
    process.env.WARM_POOL_MAX_AGE_HOURS = '24';
    process.env.RUNNER_BOOT_TIME_IN_MINUTES = '10';

    await adjustWarmPool(provider, 1);

    expect(reconcile).toHaveBeenCalledWith(expect.objectContaining({ maxAgeHours: 24, bootTimeoutMinutes: 10 }));
  });

  describe('metrics', () => {
    const result: StandbyReconcileResult = {
      ready: 1,
      preparing: 2,
      launched: 1,
      evictions: { 'max-age': 1, garbage: 2 },
      errors: [
        { operation: 'describe-spot-requests', code: 'RequestResourceCountExceeded' },
        { operation: 'describe-spot-requests', code: 'RequestLimitExceeded' },
      ],
    };

    it('does not publish metrics by default', async () => {
      reconcile.mockResolvedValue(result);

      await adjustWarmPool(provider, 1);

      expect(createSingleMetric).not.toHaveBeenCalled();
    });

    it('publishes a spot placement lookup failure as a reconcile error', async () => {
      process.env.ENABLE_METRIC_WARM_POOL = 'true';
      reconcile.mockResolvedValue({
        ...emptyResult,
        errors: [{ operation: 'spot-placement', code: 'UnauthorizedOperation' }],
      });

      await adjustWarmPool(provider, 1);

      expect(createSingleMetric).toHaveBeenCalledWith('WarmPoolReconcileErrors', 'Count', 1, {
        Environment: ENVIRONMENT,
        Operation: 'spot-placement',
      });
    });

    it('publishes counts, evictions by reason and errors by operation from the result', async () => {
      process.env.ENABLE_METRIC_WARM_POOL = 'true';
      reconcile.mockResolvedValue(result);

      await adjustWarmPool(provider, 3);

      const dimensions = { Environment: ENVIRONMENT };
      expect(vi.mocked(createSingleMetric).mock.calls).toEqual([
        ['WarmPoolWarmInstances', 'Count', 1, dimensions],
        ['WarmPoolPrimingInstances', 'Count', 2, dimensions],
        ['WarmPoolEvictions', 'Count', 1, { ...dimensions, Reason: 'max-age' }],
        ['WarmPoolEvictions', 'Count', 2, { ...dimensions, Reason: 'garbage' }],
        ['WarmPoolReconcileErrors', 'Count', 2, { ...dimensions, Operation: 'describe-spot-requests' }],
      ]);
    });
  });
});

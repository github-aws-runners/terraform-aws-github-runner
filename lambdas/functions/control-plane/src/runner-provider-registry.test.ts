import { describe, expect, it, vi } from 'vitest';

import { createEc2PoolProvider } from './pool/ec2-pool';
import type { PoolRunnerProvider } from './pool/pool-provider';
import {
  createPoolRunnerProvider,
  createScaleDownRunnerProvider,
  createScaleUpRunnerProvider,
} from './runner-provider-registry';
import { createEc2ScaleDownProvider } from './scale-runners/ec2-scale-down';
import { createEc2ScaleUpProvider } from './scale-runners/ec2-scale-up';
import type { ScaleDownRunnerProvider } from './scale-runners/scale-down-provider';
import type { ScaleUpRunnerProvider } from './scale-runners/scale-up-provider';

vi.mock('./pool/ec2-pool', () => ({ createEc2PoolProvider: vi.fn() }));
vi.mock('./scale-runners/ec2-scale-down', () => ({ createEc2ScaleDownProvider: vi.fn() }));
vi.mock('./scale-runners/ec2-scale-up', () => ({ createEc2ScaleUpProvider: vi.fn() }));

const poolImplementation = {
  listRunners: vi.fn(async () => []),
  countAvailableRunners: vi.fn(() => 0),
  createRunners: vi.fn(async () => []),
} satisfies Omit<PoolRunnerProvider, 'type'>;

const scaleUpImplementation = {
  prepareGroup: vi.fn(async () => ({ runnerLabels: [], state: undefined })),
  getCurrentRunners: vi.fn(async () => 0),
  createRunners: vi.fn(async () => []),
} satisfies Omit<ScaleUpRunnerProvider, 'type'>;

const scaleDownImplementation = {
  list: vi.fn(async () => []),
  bootTimeExceeded: vi.fn(() => false),
  markOrphan: vi.fn(async () => undefined),
  unmarkOrphan: vi.fn(async () => undefined),
  terminate: vi.fn(async () => undefined),
} satisfies Omit<ScaleDownRunnerProvider, 'type'>;

describe('runner provider registry', () => {
  it('routes EC2 capabilities and injects the provider type', () => {
    vi.mocked(createEc2PoolProvider).mockReturnValue(poolImplementation);
    vi.mocked(createEc2ScaleUpProvider).mockReturnValue(scaleUpImplementation);
    vi.mocked(createEc2ScaleDownProvider).mockReturnValue(scaleDownImplementation);

    expect(createPoolRunnerProvider('ec2')).toStrictEqual({ ...poolImplementation, type: 'ec2' });
    expect(createScaleUpRunnerProvider('ec2')).toStrictEqual({ ...scaleUpImplementation, type: 'ec2' });
    expect(createScaleDownRunnerProvider('ec2')).toStrictEqual({ ...scaleDownImplementation, type: 'ec2' });

    expect(createEc2PoolProvider).toHaveBeenCalledTimes(1);
    expect(createEc2ScaleUpProvider).toHaveBeenCalledTimes(1);
    expect(createEc2ScaleDownProvider).toHaveBeenCalledTimes(1);
  });
});

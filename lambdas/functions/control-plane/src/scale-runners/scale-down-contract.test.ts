import type { ComputeProviderType } from '@aws-github-runner/compute-providers/provider-types';
import { beforeEach, vi } from 'vitest';

import { providerTypes } from '../test/compute-provider-contracts/provider-types';
import { defineScaleDownContractTests } from '../test/compute-provider-contracts/scale-down';
import { controlPlaneProviderRegistry } from '../control-plane-providers';
import { scaleDown } from './scale-down';
import type { ScaleDownComputeProvider } from './types';

const mockedResolveCapability = vi.spyOn(controlPlaneProviderRegistry, 'capability');

const cleanEnv = process.env;

const computeProviders = providerTypes.map((type) => ({
  provider: {
    type,
    list: vi.fn(),
    bootTimeExceeded: vi.fn(),
    markOrphan: vi.fn(),
    unmarkOrphan: vi.fn(),
    terminate: vi.fn(),
  } satisfies ScaleDownComputeProvider,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
});

defineScaleDownContractTests<ComputeProviderType>({
  computeProviders,
  resolveCapability: mockedResolveCapability,
  scaleDown,
});

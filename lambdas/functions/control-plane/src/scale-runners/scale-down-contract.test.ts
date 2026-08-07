import type { RunnerProviderType } from '@aws-github-runner/runner-providers/provider-types';
import { beforeEach, vi } from 'vitest';

import { providerTypes } from '../test/runner-provider-contracts/provider-types';
import { defineScaleDownContractTests } from '../test/runner-provider-contracts/scale-down';
import { controlPlaneProviderRegistry } from '../control-plane-providers';
import { scaleDown } from './scale-down';
import type { ScaleDownRunnerProvider } from './scale-down-provider';

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
  } satisfies ScaleDownRunnerProvider,
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
});

defineScaleDownContractTests<RunnerProviderType>({
  computeProviders,
  resolveCapability: mockedResolveCapability,
  scaleDown,
});

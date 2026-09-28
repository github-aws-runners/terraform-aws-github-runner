import type { ComputeProviderType } from '@aws-github-runner/compute-providers/provider-types';
import { beforeEach, vi } from 'vitest';

import { providerTypes } from '../test/compute-provider-contracts/provider-types';
import { defineScaleDownContractTests } from '../test/compute-provider-contracts/scale-down';
import { controlPlaneProviderRegistry } from '../control-plane-providers';
import { scaleDown } from './scale-down';
import type { ScaleDownComputeProvider } from './types';

vi.mock('../github/auth', () => ({
  createGithubAppAuth: vi.fn().mockResolvedValue({ token: 'app-token', appIndex: 0 }),
  createGithubInstallationAuth: vi.fn().mockResolvedValue({ token: 'installation-token' }),
  getStoredInstallationId: vi.fn().mockResolvedValue(123),
  createOctokitClient: vi.fn().mockResolvedValue({
    actions: { listSelfHostedRunnersForOrg: vi.fn() },
    paginate: vi.fn().mockResolvedValue([]),
  }),
}));

const mockedResolveCapability = vi.spyOn(controlPlaneProviderRegistry, 'capability');

const cleanEnv = process.env;

const computeProviders = providerTypes.map((type) => ({
  provider: {
    type,
    list: vi.fn(),
    bootTimeExceeded: vi.fn(),
    markOrphan: vi.fn(),
    unmarkOrphan: vi.fn(),
    markIdle: vi.fn(),
    unmarkIdle: vi.fn(),
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

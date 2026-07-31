import { providerRegistry } from '@aws-github-runner/runner-providers/registry';

import { createStartRunnerConfig } from './scale-runners/github-runner';

export const controlPlaneProviderRegistry = providerRegistry.controlPlane(createStartRunnerConfig);

export const runnerProviderTypes = providerRegistry.types;

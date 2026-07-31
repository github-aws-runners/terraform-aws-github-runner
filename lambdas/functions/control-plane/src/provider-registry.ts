import { createControlPlaneProviderRegistry } from '@aws-github-runner/runner-providers/registry';

import { createStartRunnerConfig } from './scale-runners/github-runner';

export const controlPlaneProviderRegistry = createControlPlaneProviderRegistry(createStartRunnerConfig);

export const runnerProviderTypes = controlPlaneProviderRegistry.types;

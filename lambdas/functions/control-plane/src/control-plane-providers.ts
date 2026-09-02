import { createControlPlaneProviderRegistry } from '@aws-github-runner/compute-providers/control-plane';
import { computeProviderTypes } from '@aws-github-runner/compute-providers/provider-types';

import { createStartRunnerConfig } from './scale-runners/github-runner';

export const controlPlaneProviderRegistry = createControlPlaneProviderRegistry(createStartRunnerConfig);

export { computeProviderTypes };

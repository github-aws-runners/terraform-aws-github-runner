import { createControlPlaneProviderRegistry } from '@aws-github-runner/runner-providers/control-plane';
import { runnerProviderTypes } from '@aws-github-runner/runner-providers/provider-types';

import { createStartRunnerConfig } from './scale-runners/github-runner';

export const controlPlaneProviderRegistry = createControlPlaneProviderRegistry(createStartRunnerConfig);

export { runnerProviderTypes };

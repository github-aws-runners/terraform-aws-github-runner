import type { CreateStartRunnerConfig, ComputeProviderPlugin } from '../../core';
import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { EC2Client } from '@aws-sdk/client-ec2';

import type { ControlPlaneProviderCapabilities, ControlPlaneProviderModule } from '../../contracts';
import type {} from './src/environment';
import { createEc2PoolCapability } from './src/control-plane/pool';
import { createEc2ScaleDownCapability } from './src/control-plane/scale-down';
import { createEc2ScaleUpCapability } from './src/control-plane/scale-up';
import { createEc2RunnerClient } from './src/runners';

export function createEc2ControlPlanePlugin(
  createStartRunnerConfig: CreateStartRunnerConfig,
): ComputeProviderPlugin<ControlPlaneProviderCapabilities, 'ec2'> {
  const ec2Client = getTracedAWSV3Client(new EC2Client({ region: process.env.AWS_REGION }));
  const ec2Operations = createEc2RunnerClient(ec2Client).forRequest({ signal: undefined });

  return {
    type: 'ec2',
    capabilities: {
      pool: () => createEc2PoolCapability(ec2Operations, createStartRunnerConfig),
      scaleUp: () => createEc2ScaleUpCapability(ec2Operations, createStartRunnerConfig),
      scaleDown: () => createEc2ScaleDownCapability(ec2Operations),
    },
  };
}

export const provider = {
  type: 'ec2',
  createPlugin: createEc2ControlPlanePlugin,
} satisfies ControlPlaneProviderModule<'ec2'>;

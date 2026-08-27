import type { CreateStartRunnerConfig, ComputeProviderPlugin } from '../../core';
import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { EC2Client } from '@aws-sdk/client-ec2';

import type { ControlPlaneProviderCapabilities, ControlPlaneProviderModule } from '../../contracts';
import type {} from './src/environment';
import { createEc2PoolProvider } from './src/control-plane/pool';
import { createEc2ScaleDownProvider } from './src/control-plane/scale-down';
import { createEc2ScaleUpProvider } from './src/control-plane/scale-up';
import { createEc2RunnerClient } from './src/runners';

export function createEc2ControlPlanePlugin(
  createStartRunnerConfig: CreateStartRunnerConfig,
  ec2Client: EC2Client = getTracedAWSV3Client(new EC2Client({ region: process.env.AWS_REGION })),
): ComputeProviderPlugin<ControlPlaneProviderCapabilities, 'ec2'> {
  const runnerOperations = createEc2RunnerClient(ec2Client).forRequest({ signal: undefined });

  return {
    type: 'ec2',
    capabilities: {
      pool: () => createEc2PoolProvider(runnerOperations, createStartRunnerConfig),
      scaleUp: () => createEc2ScaleUpProvider(runnerOperations, ec2Client, createStartRunnerConfig),
      scaleDown: () => createEc2ScaleDownProvider(runnerOperations),
    },
  };
}

export const provider = {
  type: 'ec2',
  createPlugin: createEc2ControlPlanePlugin,
} satisfies ControlPlaneProviderModule<'ec2'>;

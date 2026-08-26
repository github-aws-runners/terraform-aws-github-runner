import type { CreateStartRunnerConfig, ComputeProviderPlugin } from '../../core';
import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { EC2Client } from '@aws-sdk/client-ec2';

import type { ControlPlaneProviderCapabilities, ControlPlaneProviderModule } from '../../contracts';
import type {} from './src/environment';
import { createEc2PoolProvider } from './src/control-plane/pool';
import { createEc2ScaleDownProvider } from './src/control-plane/scale-down';
import { createEc2ScaleUpProvider } from './src/control-plane/scale-up';
import { createEc2RunnerClient, type Ec2RunnerOperations } from './src/runners';

export function createEc2ControlPlanePlugin(
  createStartRunnerConfig: CreateStartRunnerConfig,
  runners: Ec2RunnerOperations,
  ec2Client: EC2Client,
): ComputeProviderPlugin<ControlPlaneProviderCapabilities, 'ec2'> {
  return {
    type: 'ec2',
    capabilities: {
      pool: () => createEc2PoolProvider(createStartRunnerConfig, runners),
      scaleUp: () => createEc2ScaleUpProvider(createStartRunnerConfig, runners, ec2Client),
      scaleDown: () => createEc2ScaleDownProvider(runners),
    },
  };
}

function createProductionEc2ControlPlanePlugin(
  createStartRunnerConfig: CreateStartRunnerConfig,
): ComputeProviderPlugin<ControlPlaneProviderCapabilities, 'ec2'> {
  const ec2Client = getTracedAWSV3Client(new EC2Client({ region: process.env.AWS_REGION }));
  const runners = createEc2RunnerClient(ec2Client).forRequest({ signal: undefined });
  return createEc2ControlPlanePlugin(createStartRunnerConfig, runners, ec2Client);
}

export const provider = {
  type: 'ec2',
  createPlugin: createProductionEc2ControlPlanePlugin,
} satisfies ControlPlaneProviderModule<'ec2'>;

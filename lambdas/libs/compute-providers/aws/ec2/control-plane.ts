import type { CreateStartRunnerConfig, ComputeProviderPlugin } from '../../core';
import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { EC2Client } from '@aws-sdk/client-ec2';

import type { ControlPlaneProviderCapabilities, ControlPlaneProviderModule } from '../../contracts';
import type {} from './src/environment';
import { createEc2PoolCapability } from './src/control-plane/pool';
import { createEc2ScaleDownCapability } from './src/control-plane/scale-down';
import { createEc2ScaleUpCapability } from './src/control-plane/scale-up';
import { createEc2RunnerClient } from './src/runners';
import { createEc2StandbyClient } from './src/standby';
import { createWarmLeaseStore } from './src/warm-lease';

export function createEc2ControlPlanePlugin(
  createStartRunnerConfig: CreateStartRunnerConfig,
): ComputeProviderPlugin<ControlPlaneProviderCapabilities, 'ec2'> {
  const ec2Client = getTracedAWSV3Client(new EC2Client({ region: process.env.AWS_REGION }));
  const ec2Operations = createEc2RunnerClient(ec2Client).forRequest({ signal: undefined });
  const standbyOperations = createEc2StandbyClient(ec2Client).forRequest({ signal: undefined });
  const dynamoClient = getTracedAWSV3Client(new DynamoDBClient({ region: process.env.AWS_REGION }));
  const warmOperations = {
    standby: standbyOperations,
    createLeaseStore: (tableName: string) => createWarmLeaseStore(dynamoClient, tableName),
  };

  return {
    type: 'ec2',
    capabilities: {
      pool: () => createEc2PoolCapability(ec2Operations, createStartRunnerConfig, standbyOperations),
      scaleUp: () => createEc2ScaleUpCapability(ec2Operations, createStartRunnerConfig, warmOperations),
      scaleDown: () => createEc2ScaleDownCapability(ec2Operations),
    },
  };
}

export const provider = {
  type: 'ec2',
  createPlugin: createEc2ControlPlanePlugin,
} satisfies ControlPlaneProviderModule<'ec2'>;

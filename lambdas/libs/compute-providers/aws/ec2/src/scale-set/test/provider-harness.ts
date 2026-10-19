import { CreateTagsCommand, EC2Client, TerminateInstancesCommand } from '@aws-sdk/client-ec2';
import { DeleteParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';

import type { Ec2ScaleSetProviderConfig } from '../configuration';
import { createEc2ScaleSetProvider } from '../provider';
import { config, githubScope } from './fixtures';

export const ec2Mock = mockClient(EC2Client);
export const ssmMock = mockClient(SSMClient);
const ec2Client = new EC2Client({ region: 'eu-west-1' });
const ssmClient = new SSMClient({ region: 'eu-west-1' });

export function createTestProvider(
  options: { githubScope?: string; now?: () => number; configuration?: Ec2ScaleSetProviderConfig } = {},
) {
  return createEc2ScaleSetProvider(
    {
      runnerConfigName: 'linux',
      scaleSetId: 42,
      githubScope: options.githubScope ?? githubScope,
      configuration: options.configuration ?? config,
    },
    {
      ec2Client,
      ssmClient,
      now: options.now ?? (() => new Date('2026-08-24T10:05:00Z').getTime()),
    },
  );
}

export function resetAwsMocks(): void {
  ec2Mock.reset();
  ssmMock.reset();
  ec2Mock.on(CreateTagsCommand).resolves({});
  ec2Mock.on(TerminateInstancesCommand).resolves({});
  ssmMock.on(PutParameterCommand).resolves({});
  ssmMock.on(DeleteParameterCommand).resolves({});
}

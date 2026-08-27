import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { EC2Client } from '@aws-sdk/client-ec2';
import type {
  CreateRunnerResult,
  CreateScaleUpRunnersInput,
  CreateStartRunnerConfig,
  CurrentRunnersInput,
  RunnerLabelResolution,
  ScaleUpComputeProvider,
} from '../../../../core';
import yn from 'yn';

import type { Ec2RunnerResourceOperations } from '../runners';
import type { Ec2OverrideConfig } from '../runners.d';
import {
  getDefaultBlockDeviceNameFromLaunchTemplate,
  parseEc2OverrideConfig,
  shouldLoadLaunchTemplateBlockDeviceName,
} from './dynamic-labels';
import { createRunners, loadEc2ProviderConfig } from './runner-config';
import type { CreateEC2RunnerConfig } from './runner-config';

const logger = createChildLogger('ec2-scale-up');

interface Ec2ScaleUpState {
  ec2OverrideConfig?: Ec2OverrideConfig;
}

function loadEc2ScaleUpProviderConfig(): CreateEC2RunnerConfig {
  return {
    ...loadEc2ProviderConfig(),
    useDedicatedHost: yn(process.env.USE_DEDICATED_HOST, { default: false }),
  };
}

export function createEc2ScaleUpProvider(
  runnerOperations: Ec2RunnerResourceOperations,
  ec2Client: EC2Client,
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<ScaleUpComputeProvider<Ec2ScaleUpState>, 'type'> {
  return {
    async resolveLabelsForRunners(messageLabels: string[]): Promise<RunnerLabelResolution<Ec2ScaleUpState>> {
      const trimmedLabels = messageLabels.map((label) => label.trim());
      const dynamicEC2Labels = trimmedLabels.filter((label) => label.startsWith('ghr-ec2-'));
      const nonEc2DynamicLabels = trimmedLabels.filter(
        (label) => label.startsWith('ghr-') && !label.startsWith('ghr-ec2-'),
      );
      const runnerLabels = [...nonEc2DynamicLabels, ...dynamicEC2Labels];
      let ec2OverrideConfig: Ec2OverrideConfig | undefined;

      if (dynamicEC2Labels.length > 0) {
        const defaultBlockDeviceName = shouldLoadLaunchTemplateBlockDeviceName(dynamicEC2Labels)
          ? await getDefaultBlockDeviceNameFromLaunchTemplate(ec2Client, process.env.LAUNCH_TEMPLATE_NAME)
          : undefined;

        ec2OverrideConfig = parseEc2OverrideConfig(dynamicEC2Labels, defaultBlockDeviceName);
        if (ec2OverrideConfig) {
          logger.debug('EC2 override config parsed from labels', { ec2OverrideConfig });
        }
      }

      return { runnerLabels, state: { ec2OverrideConfig } };
    },

    async getCurrentRunners(
      _state: Ec2ScaleUpState,
      { runnerType, runnerOwner }: CurrentRunnersInput,
    ): Promise<number> {
      return (await runnerOperations.list({ environment: process.env.ENVIRONMENT, runnerType, runnerOwner })).length;
    },

    async createRunners({
      githubRunnerConfig,
      numberOfRunners,
      githubInstallationClient,
      state,
    }: CreateScaleUpRunnersInput<Ec2ScaleUpState>): Promise<CreateRunnerResult> {
      const config = loadEc2ScaleUpProviderConfig();

      return await createRunners(
        runnerOperations,
        githubRunnerConfig,
        {
          ...config,
          ec2OverrideConfig: state.ec2OverrideConfig,
        },
        numberOfRunners,
        githubInstallationClient,
        createStartRunnerConfig,
        'scale-up-lambda',
      );
    },
  };
}

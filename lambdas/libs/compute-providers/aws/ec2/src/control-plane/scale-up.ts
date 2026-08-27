import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { CreateStartRunnerConfig, RunnerLabelResolution, ScaleUpComputeProvider } from '../../../../core';
import yn from 'yn';

import type { Ec2RunnerProvisioningOperations } from '../runners';
import type { Ec2OverrideConfig } from '../runners.d';
import { parseEc2OverrideConfig, shouldLoadLaunchTemplateBlockDeviceName } from './dynamic-labels';
import { createRunners, loadEc2ProviderConfig } from './runner-creation';
import type { CreateEC2RunnerConfig } from './runner-creation';

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

async function resolveEc2ScaleUpRunnerLabels(
  ec2Operations: Ec2RunnerProvisioningOperations,
  messageLabels: string[],
): Promise<RunnerLabelResolution<Ec2ScaleUpState>> {
  const trimmedLabels = messageLabels.map((label) => label.trim());
  const dynamicEC2Labels = trimmedLabels.filter((label) => label.startsWith('ghr-ec2-'));
  const nonEc2DynamicLabels = trimmedLabels.filter(
    (label) => label.startsWith('ghr-') && !label.startsWith('ghr-ec2-'),
  );
  const runnerLabels = [...nonEc2DynamicLabels, ...dynamicEC2Labels];
  let ec2OverrideConfig: Ec2OverrideConfig | undefined;

  if (dynamicEC2Labels.length > 0) {
    const defaultBlockDeviceName = shouldLoadLaunchTemplateBlockDeviceName(dynamicEC2Labels)
      ? await ec2Operations.getDefaultBlockDeviceNameFromLaunchTemplate(process.env.LAUNCH_TEMPLATE_NAME)
      : undefined;

    ec2OverrideConfig = parseEc2OverrideConfig(dynamicEC2Labels, defaultBlockDeviceName);
    if (ec2OverrideConfig) {
      logger.debug('EC2 override config parsed from labels', { ec2OverrideConfig });
    }
  }

  return { runnerLabels, state: { ec2OverrideConfig } };
}

export function createEc2ScaleUpCapability(
  ec2Operations: Ec2RunnerProvisioningOperations,
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<ScaleUpComputeProvider<Ec2ScaleUpState>, 'type'> {
  return {
    resolveLabelsForRunners: (labels) => resolveEc2ScaleUpRunnerLabels(ec2Operations, labels),
    getCurrentRunners: async (_state, { runnerType, runnerOwner }) =>
      (await ec2Operations.list({ environment: process.env.ENVIRONMENT, runnerType, runnerOwner })).length,
    createRunners: async ({ githubRunnerConfig, numberOfRunners, githubInstallationClient, state }) => {
      const config = loadEc2ScaleUpProviderConfig();

      return await createRunners(
        ec2Operations,
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

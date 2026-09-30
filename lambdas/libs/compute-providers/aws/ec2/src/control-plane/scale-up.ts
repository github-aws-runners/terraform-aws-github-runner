import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type { CreateStartRunnerConfig, RunnerLabelResolution, ScaleUpComputeProvider } from '../../../../core';
import yn from 'yn';

import type { Ec2RunnerProvisioningOperations } from '../runners';
import type { Ec2OverrideConfig } from '../runners.d';
import {
  parseEc2OverrideConfig,
  shouldLoadLaunchTemplateBlockDeviceName,
  validateEc2OverrideConfig,
} from './dynamic-labels';
import { createRunners, loadEc2ProviderConfig } from './runner-creation';
import type { CreateEC2RunnerConfig } from './runner-creation';
import { activateWarmRunners, type Ec2WarmActivationOperations, isWarmActivationEnabled } from './warm-activation';

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
      validateEc2OverrideConfig(ec2OverrideConfig);
      logger.debug('EC2 override config parsed from labels', { ec2OverrideConfig });
    }
  }

  return { runnerLabels, state: { ec2OverrideConfig } };
}

export function createEc2ScaleUpCapability(
  ec2Operations: Ec2RunnerProvisioningOperations,
  createStartRunnerConfig: CreateStartRunnerConfig,
  warmOperations?: Ec2WarmActivationOperations,
): Omit<ScaleUpComputeProvider<Ec2ScaleUpState>, 'type'> {
  return {
    resolveLabelsForRunners: (labels) => resolveEc2ScaleUpRunnerLabels(ec2Operations, labels),
    getCurrentRunners: async (_state, { runnerType, runnerOwner }) =>
      (await ec2Operations.list({ environment: process.env.ENVIRONMENT, runnerType, runnerOwner })).length,
    createRunners: async ({ githubRunnerConfig, numberOfRunners, githubInstallationClient, state, storage }) => {
      const config = loadEc2ScaleUpProviderConfig();
      const createColdRunners = (count: number) =>
        createRunners(
          ec2Operations,
          githubRunnerConfig,
          {
            ...config,
            ec2OverrideConfig: state.ec2OverrideConfig,
          },
          count,
          githubInstallationClient,
          createStartRunnerConfig,
          'scale-up-lambda',
          storage,
        );

      // Warm instances are launched with the default configuration, so dynamic EC2 overrides always launch cold.
      if (!warmOperations || !storage || state.ec2OverrideConfig || !isWarmActivationEnabled()) {
        return await createColdRunners(numberOfRunners);
      }

      const warm = await activateWarmRunners(ec2Operations, warmOperations, createStartRunnerConfig, {
        githubRunnerConfig,
        numberOfRunners,
        ghClient: githubInstallationClient,
        storage,
      });
      if (warm.coldRunnerCount <= 0) {
        return { instances: warm.instances, retryableErrorCount: warm.retryableErrorCount, nonRetryableErrorCount: 0 };
      }

      const cold = await createColdRunners(warm.coldRunnerCount);
      return {
        instances: [...warm.instances, ...cold.instances],
        retryableErrorCount: warm.retryableErrorCount + cold.retryableErrorCount,
        nonRetryableErrorCount: cold.nonRetryableErrorCount,
      };
    },
  };
}

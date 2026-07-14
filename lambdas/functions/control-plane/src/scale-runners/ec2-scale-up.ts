import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import yn from 'yn';

import { listEC2Runners } from '../aws/ec2-runners';
import type { Ec2OverrideConfig } from './../aws/ec2-runners.d';
import {
  getDefaultBlockDeviceNameFromLaunchTemplate,
  parseEc2OverrideConfig,
  shouldLoadLaunchTemplateBlockDeviceName,
} from './ec2-labels';
import { createRunners } from './ec2';
import type { CreateEC2RunnerConfig } from './ec2';
import type { ScaleUpRunnerProvider, ScaleUpRunnerProviderStrategy } from './scale-up-provider';

const logger = createChildLogger('ec2-scale-up');

type Ec2ScaleUpProviderConfig = Omit<CreateEC2RunnerConfig, 'ec2OverrideConfig'>;

interface Ec2ScaleUpState {
  ec2OverrideConfig?: Ec2OverrideConfig;
}

export function createEc2ScaleUpProvider(config: Ec2ScaleUpProviderConfig): ScaleUpRunnerProvider<Ec2ScaleUpState> {
  return {
    type: 'ec2',
    prepareGroup: async (messageLabels) => {
      const trimmedLabels = messageLabels.map((label) => label.trim());
      const dynamicEC2Labels = trimmedLabels.filter((label) => label.startsWith('ghr-ec2-'));
      const nonEc2DynamicLabels = trimmedLabels.filter(
        (label) => label.startsWith('ghr-') && !label.startsWith('ghr-ec2-'),
      );
      const runnerLabels = [...nonEc2DynamicLabels, ...dynamicEC2Labels];
      let ec2OverrideConfig: Ec2OverrideConfig | undefined;

      if (dynamicEC2Labels.length > 0) {
        const defaultBlockDeviceName = shouldLoadLaunchTemplateBlockDeviceName(dynamicEC2Labels)
          ? await getDefaultBlockDeviceNameFromLaunchTemplate(config.launchTemplateName)
          : undefined;

        ec2OverrideConfig = parseEc2OverrideConfig(dynamicEC2Labels, defaultBlockDeviceName);
        if (ec2OverrideConfig) {
          logger.debug('EC2 override config parsed from labels', { ec2OverrideConfig });
        }
      }

      return { runnerLabels, state: { ec2OverrideConfig } };
    },
    getCurrentRunners: async (_state, { runnerType, runnerOwner }) =>
      (await listEC2Runners({ environment: config.environment, runnerType, runnerOwner })).length,
    createRunners: async ({ githubRunnerConfig, numberOfRunners, githubInstallationClient, state }) =>
      await createRunners(
        githubRunnerConfig,
        {
          ...config,
          ec2OverrideConfig: state.ec2OverrideConfig,
        },
        numberOfRunners,
        githubInstallationClient,
        'scale-up-lambda',
      ),
  };
}

export function createEc2ScaleUpProviderFromEnv(
  environment: string,
  scaleErrors: string[],
): ScaleUpRunnerProvider<Ec2ScaleUpState> {
  return createEc2ScaleUpProvider({
    ec2instanceCriteria: {
      instanceTypes: process.env.INSTANCE_TYPES.split(','),
      instanceTypePriorities: process.env.INSTANCE_TYPE_PRIORITIES
        ? (JSON.parse(process.env.INSTANCE_TYPE_PRIORITIES) as Record<string, number>)
        : undefined,
      targetCapacityType: process.env.INSTANCE_TARGET_CAPACITY_TYPE,
      maxSpotPrice: process.env.INSTANCE_MAX_SPOT_PRICE,
      instanceAllocationStrategy: process.env.INSTANCE_ALLOCATION_STRATEGY || 'lowest-price',
    },
    environment,
    launchTemplateName: process.env.LAUNCH_TEMPLATE_NAME,
    subnets: process.env.SUBNET_IDS.split(','),
    amiIdSsmParameterName: process.env.AMI_ID_SSM_PARAMETER_NAME,
    tracingEnabled: yn(process.env.POWERTOOLS_TRACE_ENABLED, { default: false }),
    onDemandFailoverOnError: process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS
      ? (JSON.parse(process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS) as [string])
      : [],
    scaleErrors,
    useDedicatedHost: yn(process.env.USE_DEDICATED_HOST, { default: false }),
  });
}

export const ec2ScaleUpRunnerProviderStrategy: ScaleUpRunnerProviderStrategy<Ec2ScaleUpState> = {
  type: 'ec2',
  createFromEnv: ({ environment, scaleErrors }) => createEc2ScaleUpProviderFromEnv(environment, scaleErrors),
};

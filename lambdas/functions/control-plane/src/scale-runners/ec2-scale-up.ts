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
import type {
  CreateScaleUpRunnersInput,
  CurrentRunnersInput,
  PreparedScaleUpRunnerGroup,
  ScaleUpRunnerProvider,
} from './scale-up-provider';

const logger = createChildLogger('ec2-scale-up');

type Ec2ScaleUpProviderConfig = Omit<CreateEC2RunnerConfig, 'ec2OverrideConfig'>;

interface Ec2ScaleUpState {
  ec2OverrideConfig?: Ec2OverrideConfig;
}

function loadEc2ScaleUpProviderConfig(): Ec2ScaleUpProviderConfig {
  return {
    ec2instanceCriteria: {
      instanceTypes: process.env.INSTANCE_TYPES.split(','),
      instanceTypePriorities: process.env.INSTANCE_TYPE_PRIORITIES
        ? (JSON.parse(process.env.INSTANCE_TYPE_PRIORITIES) as Record<string, number>)
        : undefined,
      targetCapacityType: process.env.INSTANCE_TARGET_CAPACITY_TYPE,
      maxSpotPrice: process.env.INSTANCE_MAX_SPOT_PRICE,
      instanceAllocationStrategy: process.env.INSTANCE_ALLOCATION_STRATEGY || 'lowest-price',
    },
    environment: process.env.ENVIRONMENT,
    launchTemplateName: process.env.LAUNCH_TEMPLATE_NAME,
    subnets: process.env.SUBNET_IDS.split(','),
    amiIdSsmParameterName: process.env.AMI_ID_SSM_PARAMETER_NAME,
    tracingEnabled: yn(process.env.POWERTOOLS_TRACE_ENABLED, { default: false }),
    onDemandFailoverOnError: process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS
      ? (JSON.parse(process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS) as [string])
      : [],
    scaleErrors: JSON.parse(process.env.SCALE_ERRORS) as [string],
    useDedicatedHost: yn(process.env.USE_DEDICATED_HOST, { default: false }),
  };
}

async function prepareEc2ScaleUpGroup(messageLabels: string[]): Promise<PreparedScaleUpRunnerGroup<Ec2ScaleUpState>> {
  const trimmedLabels = messageLabels.map((label) => label.trim());
  const dynamicEC2Labels = trimmedLabels.filter((label) => label.startsWith('ghr-ec2-'));
  const nonEc2DynamicLabels = trimmedLabels.filter(
    (label) => label.startsWith('ghr-') && !label.startsWith('ghr-ec2-'),
  );
  const runnerLabels = [...nonEc2DynamicLabels, ...dynamicEC2Labels];
  let ec2OverrideConfig: Ec2OverrideConfig | undefined;

  if (dynamicEC2Labels.length > 0) {
    const defaultBlockDeviceName = shouldLoadLaunchTemplateBlockDeviceName(dynamicEC2Labels)
      ? await getDefaultBlockDeviceNameFromLaunchTemplate(process.env.LAUNCH_TEMPLATE_NAME)
      : undefined;

    ec2OverrideConfig = parseEc2OverrideConfig(dynamicEC2Labels, defaultBlockDeviceName);
    if (ec2OverrideConfig) {
      logger.debug('EC2 override config parsed from labels', { ec2OverrideConfig });
    }
  }

  return { runnerLabels, state: { ec2OverrideConfig } };
}

async function getCurrentEc2Runners(
  _state: Ec2ScaleUpState,
  { runnerType, runnerOwner }: CurrentRunnersInput,
): Promise<number> {
  return (await listEC2Runners({ environment: process.env.ENVIRONMENT, runnerType, runnerOwner })).length;
}

async function createEc2ScaleUpRunners({
  githubRunnerConfig,
  numberOfRunners,
  githubInstallationClient,
  state,
}: CreateScaleUpRunnersInput<Ec2ScaleUpState>): Promise<string[]> {
  const config = loadEc2ScaleUpProviderConfig();

  return await createRunners(
    githubRunnerConfig,
    {
      ...config,
      ec2OverrideConfig: state.ec2OverrideConfig,
    },
    numberOfRunners,
    githubInstallationClient,
    'scale-up-lambda',
  );
}

export function createEc2ScaleUpProvider(): ScaleUpRunnerProvider<Ec2ScaleUpState> {
  return {
    type: 'ec2',
    prepareGroup: prepareEc2ScaleUpGroup,
    getCurrentRunners: getCurrentEc2Runners,
    createRunners: createEc2ScaleUpRunners,
  };
}

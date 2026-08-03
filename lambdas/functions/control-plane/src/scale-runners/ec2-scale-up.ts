import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import yn from 'yn';

import { listEC2Runners } from '../aws/ec2-runners';
import type { Ec2OverrideConfig } from './../aws/ec2-runners.d';
import {
  getDefaultBlockDeviceNameFromLaunchTemplate,
  parseEc2OverrideConfig,
  shouldLoadLaunchTemplateBlockDeviceName,
} from './ec2-labels';
import { createRunners, loadEc2ProviderConfig } from './ec2';
import type { CreateEC2RunnerConfig } from './ec2';
import type {
  CreateScaleUpRunnersInput,
  CreateScaleUpRunnersResult,
  CurrentRunnersInput,
  PreparedScaleUpRunnerGroup,
  ScaleUpRunnerProvider,
} from './scale-up-provider';

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
}: CreateScaleUpRunnersInput<Ec2ScaleUpState>): Promise<CreateScaleUpRunnersResult> {
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

export function createEc2ScaleUpProvider(): Omit<ScaleUpRunnerProvider<Ec2ScaleUpState>, 'type'> {
  return {
    prepareGroup: prepareEc2ScaleUpGroup,
    getCurrentRunners: getCurrentEc2Runners,
    createRunners: createEc2ScaleUpRunners,
  };
}

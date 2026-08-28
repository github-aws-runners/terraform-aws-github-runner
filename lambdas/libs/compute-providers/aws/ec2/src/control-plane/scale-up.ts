import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type {
  CreateRunnerResult,
  CreateScaleUpRunnersInput,
  CreateStartRunnerConfig,
  CurrentRunnersInput,
  RunnerLabelResolution,
  ScaleUpComputeProvider,
} from '../../../../core';
import yn from 'yn';

import { listEC2Runners } from './runners';
import type { Ec2OverrideConfig } from './runners.d';
import {
  getDefaultBlockDeviceNameFromLaunchTemplate,
  parseEc2OverrideConfig,
  shouldLoadLaunchTemplateBlockDeviceName,
} from './dynamic-labels';
import { createRunners, loadEc2ProviderConfig } from './runner-config';
import type { CreateEC2RunnerConfig } from './runner-config';
import { ec2RunnerCountCache, dynamoDbRunnerCountCache } from './runner-count-cache';

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

async function resolveEc2LabelsForRunners(messageLabels: string[]): Promise<RunnerLabelResolution<Ec2ScaleUpState>> {
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

function runnerCountCacheTableName(): string | undefined {
  const t = process.env.RUNNER_COUNT_CACHE_TABLE_NAME;
  return t && t.trim() !== '' ? t : undefined;
}

let runnerCountCacheInitialized = false;
function ensureRunnerCountCacheInitialized(tableName: string): void {
  if (runnerCountCacheInitialized) return;
  const region = process.env.AWS_REGION;
  const staleThresholdMs = parseInt(process.env.RUNNER_COUNT_CACHE_STALE_THRESHOLD_MS || '60000', 10);
  if (region) {
    dynamoDbRunnerCountCache.initialize(tableName, region, staleThresholdMs);
    runnerCountCacheInitialized = true;
  }
}

/**
 * Returns the number of current EC2 runners for the given owner group.
 *
 * By default this lists EC2 instances (DescribeInstances). When the runner
 * count cache is enabled (RUNNER_COUNT_CACHE_TABLE_NAME set), it first serves
 * from a short-lived in-memory cache, then from the DynamoDB counter maintained
 * out-of-band by the runner-count-cache Lambda (EventBridge EC2 state changes),
 * and only falls back to DescribeInstances when the counter is cold or stale.
 * This keeps the expensive EC2 API off the hot scale-up path in the common case
 * while staying correct via the fallback (Issue #4710). The optimisation is an
 * EC2-provider implementation detail: the control plane is unaware of it.
 */
async function getCurrentEc2Runners(
  _state: Ec2ScaleUpState,
  { runnerType, runnerOwner }: CurrentRunnersInput,
): Promise<number> {
  const listActual = async (): Promise<number> =>
    (await listEC2Runners({ environment: process.env.ENVIRONMENT, runnerType, runnerOwner })).length;

  const tableName = runnerCountCacheTableName();
  if (!tableName) {
    return listActual(); // feature disabled -> authoritative EC2 listing (unchanged behaviour)
  }

  ensureRunnerCountCacheInitialized(tableName);
  const environment = process.env.ENVIRONMENT ?? '';

  // 1) in-memory (dedupes repeated reads within an invocation)
  const memo = ec2RunnerCountCache.get(environment, runnerType, runnerOwner);
  if (memo !== undefined) {
    return memo;
  }

  // 2) DynamoDB counter, if fresh
  const cached = await dynamoDbRunnerCountCache.get(environment, runnerType, runnerOwner);
  if (cached && !cached.isStale) {
    ec2RunnerCountCache.set(environment, runnerType, runnerOwner, cached.count);
    return cached.count;
  }
  if (cached?.isStale) {
    logger.debug('Runner count cache stale, falling back to EC2 DescribeInstances', {
      environment,
      runnerType,
      runnerOwner,
    });
  }

  // 3) miss or stale -> authoritative EC2 listing, then memoise briefly
  const actual = await listActual();
  ec2RunnerCountCache.set(environment, runnerType, runnerOwner, actual);
  return actual;
}

async function createEc2ScaleUpRunners(
  { githubRunnerConfig, numberOfRunners, githubInstallationClient, state }: CreateScaleUpRunnersInput<Ec2ScaleUpState>,
  createStartRunnerConfig: CreateStartRunnerConfig,
): Promise<CreateRunnerResult> {
  const config = loadEc2ScaleUpProviderConfig();

  const result = await createRunners(
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

  // New runners now exist; drop the short-lived in-memory count so a later read
  // in the same invocation reflects them via the DescribeInstances fallback. The
  // DynamoDB counter converges shortly after via the EventBridge counter Lambda.
  ec2RunnerCountCache.reset();

  return result;
}

export function createEc2ScaleUpProvider(
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<ScaleUpComputeProvider<Ec2ScaleUpState>, 'type'> {
  return {
    resolveLabelsForRunners: resolveEc2LabelsForRunners,
    getCurrentRunners: getCurrentEc2Runners,
    createRunners: (input) => createEc2ScaleUpRunners(input, createStartRunnerConfig),
  };
}

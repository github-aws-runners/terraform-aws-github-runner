import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import yn from 'yn';

import { listEC2Runners, startRunner, tag, untag } from '../aws/ec2-runners';
import type { Ec2OverrideConfig } from './../aws/ec2-runners.d';
import { emitWarmPoolMetric, getWarmPoolConfig, listWarmInstancesByOwner, removeFromWarmPool } from '../aws/warm-pool';
import {
  getDefaultBlockDeviceNameFromLaunchTemplate,
  parseEc2OverrideConfig,
  shouldLoadLaunchTemplateBlockDeviceName,
} from './ec2-labels';
import { createRunners, loadEc2ProviderConfig, registerRunners } from './ec2';
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

  const emptyResult: CreateScaleUpRunnersResult = {
    instances: [],
    retryableErrorCount: 0,
    nonRetryableErrorCount: 0,
  };

  // Warm pool: reuse stopped instances before cold-launching new ones. Gated only on
  // warm_pool_config.enabled so the stop/start behavior is independent of pool_strategy.
  let warmResult = emptyResult;
  if (getWarmPoolConfig().enabled) {
    const warmInstances = await startWarmInstances(githubRunnerConfig.runnerOwner, numberOfRunners);
    if (warmInstances.length > 0) {
      logger.info(
        `Started ${warmInstances.length} warm instance(s) for owner '${githubRunnerConfig.runnerOwner}', ` +
          `${Math.max(0, numberOfRunners - warmInstances.length)} remaining from cold start.`,
      );
      warmResult = await registerRunners(
        githubRunnerConfig,
        { instances: warmInstances, retryableErrorCount: 0, nonRetryableErrorCount: 0 },
        githubInstallationClient,
      );
    }
  }

  const remainingRunners = numberOfRunners - warmResult.instances.length;
  let coldResult = emptyResult;
  if (remainingRunners > 0) {
    coldResult = await createRunners(
      githubRunnerConfig,
      {
        ...config,
        ec2OverrideConfig: state.ec2OverrideConfig,
      },
      remainingRunners,
      githubInstallationClient,
      'scale-up-lambda',
    );
  }

  return {
    instances: [...warmResult.instances, ...coldResult.instances],
    retryableErrorCount: warmResult.retryableErrorCount + coldResult.retryableErrorCount,
    nonRetryableErrorCount: warmResult.nonRetryableErrorCount + coldResult.nonRetryableErrorCount,
  };
}

/**
 * Claims and starts up to `count` warm (stopped) instances for the owner. Each instance is claimed
 * atomically via a conditional DynamoDB delete so concurrent scale-up invocations cannot start the
 * same instance. Returns the instance IDs that were successfully started; callers are responsible
 * for registering them with GitHub.
 */
export async function startWarmInstances(runnerOwner: string, count: number): Promise<string[]> {
  if (count <= 0) {
    return [];
  }

  let warmInstances = await listWarmInstancesByOwner(runnerOwner);
  // If no warm instances found and owner contains a repo (org/repo), try org-level lookup.
  if (warmInstances.length === 0 && runnerOwner.includes('/')) {
    const orgOwner = runnerOwner.split('/')[0];
    warmInstances = await listWarmInstancesByOwner(orgOwner);
    if (warmInstances.length > 0) {
      logger.info(`Found ${warmInstances.length} warm instances under org owner '${orgOwner}'`);
    }
  }

  const startedInstances: string[] = [];
  for (const entry of warmInstances) {
    if (startedInstances.length >= count) {
      break;
    }

    try {
      // Atomically claim the warm instance — prevents concurrent scale-up from using the same one.
      const claimed = await removeFromWarmPool(entry.instanceId);
      if (!claimed) {
        logger.info(`Warm instance '${entry.instanceId}' already claimed by another invocation, skipping`);
        continue;
      }

      const startTime = Date.now();
      await startRunner(entry.instanceId);
      const startLatencyMs = Date.now() - startTime;
      startedInstances.push(entry.instanceId);
      emitWarmPoolMetric('WarmPoolInstanceStarted', 1, { Owner: runnerOwner });
      emitWarmPoolMetric('WarmPoolStartLatency', startLatencyMs, { Owner: runnerOwner });
      logger.info(`Started warm instance '${entry.instanceId}' for owner '${runnerOwner}' (${startLatencyMs}ms)`);

      // Observability tags (best-effort).
      await Promise.all([
        tag(entry.instanceId, [{ Key: 'ghr:started-from-warm-pool', Value: 'true' }]),
        untag(entry.instanceId, [{ Key: 'ghr:warm-pool-member' }]),
      ]).catch((e) => {
        logger.warn(`Failed to update tags on '${entry.instanceId}', continuing`, { error: e });
      });
    } catch (e) {
      logger.warn(`Failed to start warm instance '${entry.instanceId}', skipping`, { error: e as Error });
      emitWarmPoolMetric('WarmPoolStartFailed', 1, { Owner: runnerOwner });
      // Remove stale DynamoDB record — instance may already be terminated.
      await removeFromWarmPool(entry.instanceId).catch(() => {
        /* best-effort */
      });
    }
  }

  return startedInstances;
}

export function createEc2ScaleUpProvider(): Omit<ScaleUpRunnerProvider<Ec2ScaleUpState>, 'type'> {
  return {
    prepareGroup: prepareEc2ScaleUpGroup,
    getCurrentRunners: getCurrentEc2Runners,
    createRunners: createEc2ScaleUpRunners,
  };
}

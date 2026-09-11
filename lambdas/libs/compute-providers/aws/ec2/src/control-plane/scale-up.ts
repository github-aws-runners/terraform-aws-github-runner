import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import type {
  CreateRunnerResult,
  CreateStartRunnerConfig,
  RunnerLabelResolution,
  ScaleUpComputeProvider,
} from '../../../../core';
import yn from 'yn';

import type { Ec2RunnerProvisioningOperations, Ec2RunnerResourceOperations } from '../runners';
import type { Ec2OverrideConfig } from '../runners.d';
import {
  parseEc2OverrideConfig,
  shouldLoadLaunchTemplateBlockDeviceName,
  validateEc2OverrideConfig,
} from './dynamic-labels';
import { createRunners, loadEc2ProviderConfig, registerRunners } from './runner-creation';
import type { CreateEC2RunnerConfig } from './runner-creation';
import { emitWarmPoolMetric, getWarmPoolConfig, listWarmInstancesByOwner, removeFromWarmPool } from './warm-pool';

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

/**
 * Claims and starts up to `count` warm (stopped) instances for the owner. Each instance is claimed
 * atomically via a conditional DynamoDB delete so concurrent scale-up invocations cannot start the
 * same instance. Returns the instance IDs that were successfully started; callers are responsible
 * for registering them with GitHub.
 */
export async function startWarmInstances(
  ec2Operations: Ec2RunnerResourceOperations,
  runnerOwner: string,
  count: number,
): Promise<string[]> {
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
      await ec2Operations.start(entry.instanceId);
      const startLatencyMs = Date.now() - startTime;
      startedInstances.push(entry.instanceId);
      emitWarmPoolMetric('WarmPoolInstanceStarted', 1, { Owner: runnerOwner });
      emitWarmPoolMetric('WarmPoolStartLatency', startLatencyMs, { Owner: runnerOwner });
      logger.info(`Started warm instance '${entry.instanceId}' for owner '${runnerOwner}' (${startLatencyMs}ms)`);

      // Observability tags (best-effort).
      await Promise.all([
        ec2Operations.tag(entry.instanceId, [{ Key: 'ghr:started-from-warm-pool', Value: 'true' }]),
        ec2Operations.untag(entry.instanceId, [{ Key: 'ghr:warm-pool-member', Value: 'true' }]),
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

export function createEc2ScaleUpCapability(
  ec2Operations: Ec2RunnerProvisioningOperations,
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<ScaleUpComputeProvider<Ec2ScaleUpState>, 'type'> {
  return {
    resolveLabelsForRunners: (labels) => resolveEc2ScaleUpRunnerLabels(ec2Operations, labels),
    getCurrentRunners: async (_state, { runnerType, runnerOwner }) =>
      (await ec2Operations.list({ environment: process.env.ENVIRONMENT, runnerType, runnerOwner })).length,
    createRunners: async ({ githubRunnerConfig, numberOfRunners, githubInstallationClient, state, storage }) => {
      const config = loadEc2ScaleUpProviderConfig();
      const emptyResult: CreateRunnerResult = { instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 0 };

      // Warm pool: reuse stopped instances before cold-launching new ones. Gated only on
      // warm_pool_config.enabled so the stop/start behavior is independent of pool_strategy.
      let warmResult = emptyResult;
      if (getWarmPoolConfig().enabled) {
        const warmInstances = await startWarmInstances(ec2Operations, githubRunnerConfig.runnerOwner, numberOfRunners);
        if (warmInstances.length > 0) {
          logger.info(
            `Started ${warmInstances.length} warm instance(s) for owner '${githubRunnerConfig.runnerOwner}', ` +
              `${Math.max(0, numberOfRunners - warmInstances.length)} remaining from cold start.`,
          );
          warmResult = await registerRunners(
            ec2Operations,
            githubRunnerConfig,
            { instances: warmInstances, retryableErrorCount: 0, nonRetryableErrorCount: 0 },
            githubInstallationClient,
            createStartRunnerConfig,
            storage,
          );
        }
      }

      const remainingRunners = numberOfRunners - warmResult.instances.length;
      let coldResult = emptyResult;
      if (remainingRunners > 0) {
        coldResult = await createRunners(
          ec2Operations,
          githubRunnerConfig,
          {
            ...config,
            ec2OverrideConfig: state.ec2OverrideConfig,
          },
          remainingRunners,
          githubInstallationClient,
          createStartRunnerConfig,
          'scale-up-lambda',
          storage,
        );
      }

      return {
        instances: [...warmResult.instances, ...coldResult.instances],
        retryableErrorCount: warmResult.retryableErrorCount + coldResult.retryableErrorCount,
        nonRetryableErrorCount: warmResult.nonRetryableErrorCount + coldResult.nonRetryableErrorCount,
      };
    },
  };
}

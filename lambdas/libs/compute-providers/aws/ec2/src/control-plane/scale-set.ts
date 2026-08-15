import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { deleteParameter, putParameter } from '@aws-github-runner/aws-ssm-util';
import type {
  CreateRunnerResult,
  CreateScaleSetRunnersInput,
  GenerateScaleSetJitConfig,
  GetCurrentScaleSetRunnersInput,
  MarkScaleSetRunnerStartedInput,
  RemoveScaleSetRunner,
  ScaleSetComputeProvider,
  ScaleSetRunnerConfig,
  ScaleSetRunnerState,
  StartRunnerConfigOptions,
  TerminateScaleSetRunnerInput,
  TerminateSurplusScaleSetRunnersInput,
} from '../../../../core';
import yn from 'yn';

import { createConfiguredRunners, type ConfigureRunnerInstancesResult, loadEc2ProviderConfig } from './runner-config';
import { bootTimeExceeded, listEC2Runners, tag, terminateRunner } from './runners';

const logger = createChildLogger('ec2-scale-set');
const GITHUB_RUNNER_ID_TAG_KEY = 'ghr:github_runner_id';
const RUNNER_NAME_TAG_KEY = 'ghr:runner_name';
const SCALE_SET_ID_TAG_KEY = 'ghr:scale_set_id';
const SCALE_SET_STATE_TAG_KEY = 'ghr:scale_set_state';

class PermanentScaleSetConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentScaleSetConfigurationError';
  }
}

function loadEc2ScaleSetProviderConfig() {
  return {
    ...loadEc2ProviderConfig(),
    useDedicatedHost: yn(process.env.USE_DEDICATED_HOST, { default: false }),
  };
}

async function getCurrentEc2ScaleSetRunners({
  runnerType,
  runnerOwner,
  scaleSetId,
  runnerNamePrefix,
  ssmTokenPath,
  removeJitRunner,
}: GetCurrentScaleSetRunnersInput): Promise<number> {
  validateScaleSetId(scaleSetId);
  const runners = await listEC2Runners({
    environment: process.env.ENVIRONMENT,
    runnerType,
    runnerOwner,
    scaleSetId,
    source: 'scale-set-lambda',
  });

  let currentRunners = 0;
  for (const runner of runners) {
    const jitConfigParameter = `${ssmTokenPath}/${runner.id}`;
    const stopped = runner.scaleSetState === 'stopped';
    const staleProvisioning = runner.scaleSetState === 'provisioning' && bootTimeExceeded(runner);
    const stalePublishing = runner.scaleSetState === 'publishing' && bootTimeExceeded(runner);
    const staleConfigPublished = runner.scaleSetState === 'config-published' && bootTimeExceeded(runner);
    const shouldReap =
      stopped || runner.scaleSetState === 'retiring' || staleProvisioning || stalePublishing || staleConfigPublished;
    if (!shouldReap) {
      currentRunners++;
      continue;
    }

    if (stopped || staleProvisioning || stalePublishing) {
      await deleteStaleScaleSetJitConfig(jitConfigParameter, runner.id, scaleSetId);
    }
    if (staleConfigPublished && !(await claimJitConfigForTermination(jitConfigParameter, runner.id, scaleSetId))) {
      // The bootstrap deletes the parameter immediately before starting the
      // runner. Its absence means the instance may already be executing.
      currentRunners++;
      continue;
    }
    if (stalePublishing || staleConfigPublished) {
      // `publishing` is persisted before PutParameter and bootstrap waits for
      // `config-published`, so a missing parameter cannot mean a running runner.
      // A successfully deleted `config-published` parameter is likewise an exact
      // cancellation fence. Persist retirement before cleanup so later retries
      // remain fail-closed.
      await tag(runner.id, [{ Key: SCALE_SET_STATE_TAG_KEY, Value: 'retiring' }]);
    }
    logger.warn('Terminating safely reaped scale-set runner', {
      runnerId: runner.id,
      scaleSetId,
      scaleSetState: runner.scaleSetState,
      jitConfigParameter,
    });
    if (runner.scaleSetState === 'retiring' || stalePublishing || staleConfigPublished) {
      await removeRequiredTaggedGitHubRunner(
        runner.githubRunnerId,
        runner.id,
        `${runnerNamePrefix}${runner.id}`,
        scaleSetId,
        removeJitRunner,
      );
    } else {
      await removeTaggedGitHubRunner(
        runner.githubRunnerId,
        runner.id,
        `${runnerNamePrefix}${runner.id}`,
        scaleSetId,
        removeJitRunner,
      );
    }
    await terminateRunner(runner.id);
  }
  return currentRunners;
}

async function removeTaggedGitHubRunner(
  taggedRunnerId: string | undefined,
  instanceId: string,
  expectedRunnerName: string,
  scaleSetId: number,
  removeJitRunner: RemoveScaleSetRunner,
): Promise<void> {
  if (!taggedRunnerId) return;

  const runnerId = Number(taggedRunnerId);
  if (!Number.isSafeInteger(runnerId) || runnerId <= 0) {
    logger.warn('Cannot remove GitHub scale-set runner with an invalid tagged runner ID', {
      instanceId,
      githubRunnerId: taggedRunnerId,
    });
    return;
  }

  // The orchestrator maps GitHub 404 to success. Any other failure must retain
  // the tagged compute pointer so reconciliation can retry exact cleanup.
  await removeJitRunner({ runnerId, runnerName: expectedRunnerName, scaleSetId });
}

async function configureScaleSetRunners(
  runnerConfig: ScaleSetRunnerConfig,
  runnerIds: string[],
  generateJitConfig: GenerateScaleSetJitConfig,
  removeRunner: RemoveScaleSetRunner,
  options: StartRunnerConfigOptions,
): Promise<ConfigureRunnerInstancesResult> {
  const failures: ConfigureRunnerInstancesResult['failures'] = [];
  let preservedRetryableErrorCount = 0;
  let preservedNonRetryableErrorCount = 0;

  for (const runnerId of runnerIds) {
    const expectedRunnerName = `${runnerConfig.runnerNamePrefix}${runnerId}`;
    let jitRunnerId: number | undefined;
    let cleanupJitRunnerOnFailure = false;

    try {
      const jitConfig = await generateJitConfig({ runnerName: expectedRunnerName });
      jitRunnerId = jitConfig.runnerId;
      cleanupJitRunnerOnFailure = true;
      if (jitConfig.runnerName !== expectedRunnerName) {
        throw new PermanentScaleSetConfigurationError(
          `Scale-set JIT config returned runner name '${jitConfig.runnerName}', expected '${expectedRunnerName}'`,
        );
      }
      if (!jitConfig.encodedJitConfig) {
        throw new PermanentScaleSetConfigurationError(
          `Scale-set JIT config for runner '${expectedRunnerName}' is empty`,
        );
      }

      // Persist both identifiers atomically before publishing the JIT config. These
      // tags are the exact-name lifecycle and best-effort cleanup boundaries.
      await tag(runnerId, [
        { Key: RUNNER_NAME_TAG_KEY, Value: expectedRunnerName },
        { Key: GITHUB_RUNNER_ID_TAG_KEY, Value: String(jitConfig.runnerId) },
      ]);
      // Persist a protected state before the ambiguous SSM write. If PutParameter
      // succeeds but its response is lost, later reconciliation must not treat this
      // instance as ordinary stale provisioning compute.
      await tag(runnerId, [{ Key: SCALE_SET_STATE_TAG_KEY, Value: 'publishing' }]);
      const jitConfigParameter = `${runnerConfig.ssmTokenPath}/${runnerId}`;
      try {
        await putParameter(jitConfigParameter, jitConfig.encodedJitConfig, true, {
          tags: [...(options.getSsmParameterTags?.(runnerId) ?? []), ...runnerConfig.ssmParameterStoreTags],
        });
      } catch (publicationError) {
        const cancellation = await cancelAmbiguousJitPublication(jitConfigParameter, runnerId, expectedRunnerName);
        if (!cancellation.safelyCancelled) {
          // The write may have succeeded and its JIT config may already be in use.
          // Preserve both GitHub and compute state until an exact lifecycle message
          // or an operator-safe reconciliation can establish what happened.
          cleanupJitRunnerOnFailure = false;
          logger.warn('Preserving scale-set runner after an ambiguous JIT publication failure', {
            runnerId,
            runnerName: expectedRunnerName,
            jitConfigParameter,
            error: publicationError instanceof Error ? publicationError.message : String(publicationError),
          });
          if (
            isPermanentScaleSetConfigurationError(publicationError) ||
            isPermanentScaleSetConfigurationError(cancellation.error)
          ) {
            preservedNonRetryableErrorCount++;
          } else {
            preservedRetryableErrorCount++;
          }
          continue;
        }
        throw publicationError;
      }
      // Once SSM publication succeeds, the config may be consumed as soon as the
      // publication fence becomes visible. Never remove that GitHub runner here.
      cleanupJitRunnerOnFailure = false;
      try {
        await tag(runnerId, [{ Key: SCALE_SET_STATE_TAG_KEY, Value: 'config-published' }]);
      } catch (stateTagError) {
        const publicationState = await verifyScaleSetPublication(runnerConfig, runnerId, expectedRunnerName);
        logger.warn('Scale-set publication tag returned an error; preserving the bootstrap-gated instance', {
          runnerId,
          runnerName: expectedRunnerName,
          publicationState,
          error: stateTagError instanceof Error ? stateTagError.message : String(stateTagError),
        });
        // The CreateTags request may have succeeded despite the failed response. Count
        // every ambiguous outcome as current. If the state remains `publishing`, the
        // bootstrap stays gated and stale reconciliation safely cancels it later.
        if (publicationState !== 'published') {
          if (isPermanentScaleSetConfigurationError(stateTagError)) preservedNonRetryableErrorCount++;
          else preservedRetryableErrorCount++;
        }
        continue;
      }
    } catch (error) {
      if (jitRunnerId !== undefined && cleanupJitRunnerOnFailure) {
        try {
          await removeRunner({
            runnerId: jitRunnerId,
            runnerName: expectedRunnerName,
            scaleSetId: runnerConfig.scaleSetId,
          });
        } catch (cleanupError) {
          logger.warn('Failed to remove unpublished GitHub scale-set runner', {
            runnerId,
            githubRunnerId: jitRunnerId,
            runnerName: expectedRunnerName,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          });
          if (isPermanentScaleSetConfigurationError(error) || isPermanentScaleSetConfigurationError(cleanupError)) {
            preservedNonRetryableErrorCount++;
          } else {
            preservedRetryableErrorCount++;
          }
          continue;
        }
      }

      const retryable = !isPermanentScaleSetConfigurationError(error);
      failures.push({ instanceId: runnerId, retryable });
      logger.warn('Failed to configure scale-set runner', {
        runnerId,
        runnerName: expectedRunnerName,
        error: error instanceof Error ? error.message : String(error),
        retryable,
      });
    }
  }

  return { failures, preservedRetryableErrorCount, preservedNonRetryableErrorCount };
}

async function cancelAmbiguousJitPublication(
  parameterName: string,
  runnerId: string,
  runnerName: string,
): Promise<{ safelyCancelled: boolean; error?: unknown }> {
  try {
    await deleteParameter(parameterName);
    return { safelyCancelled: true };
  } catch (error) {
    logger.warn('Could not establish safe cancellation after JIT publication failed', {
      runnerId,
      runnerName,
      jitConfigParameter: parameterName,
      errorName: error instanceof Error ? error.name : typeof error,
      error: error instanceof Error ? error.message : String(error),
    });
    return { safelyCancelled: false, error };
  }
}

function isPermanentScaleSetConfigurationError(error: unknown): boolean {
  if (error instanceof PermanentScaleSetConfigurationError) return true;
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  if (candidate.name === 'ScaleSetProtocolError') return true;

  const identity = [candidate.name, candidate.code]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (/throttl|timeout|temporar|serviceunavailable|internalserver|network|econn|socket|slowdown/.test(identity)) {
    return false;
  }
  if (/accessdenied|unauthor|forbidden|permission|validation|invalid|malformed|unsupported/.test(identity)) {
    return true;
  }

  const status = [candidate.status, candidate.statusCode, candidate.$metadata?.httpStatusCode].find(
    (value): value is number => typeof value === 'number',
  );
  if (status !== undefined) {
    return status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status);
  }
  return false;
}

type ScaleSetPublicationState = 'published' | 'not-published' | 'unknown';

async function verifyScaleSetPublication(
  runnerConfig: ScaleSetRunnerConfig,
  runnerId: string,
  runnerName: string,
): Promise<ScaleSetPublicationState> {
  let matchingRunners;
  try {
    matchingRunners = await listEC2Runners({
      environment: process.env.ENVIRONMENT,
      runnerOwner: runnerConfig.runnerOwner,
      runnerType: runnerConfig.runnerType,
      runnerName,
      scaleSetId: runnerConfig.scaleSetId,
      source: 'scale-set-lambda',
    });
  } catch (error) {
    logger.warn('Failed to verify scale-set publication state after tagging failed', {
      runnerId,
      runnerName,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'unknown';
  }

  if (matchingRunners.length !== 1 || matchingRunners[0].id !== runnerId) {
    return 'unknown';
  }

  const state: ScaleSetRunnerState | undefined = matchingRunners[0].scaleSetState;
  if (state === 'config-published' || state === 'ready') return 'published';
  if (state === 'provisioning' || state === 'publishing' || state === 'retiring' || state === 'stopped') {
    return 'not-published';
  }
  return 'unknown';
}

async function createEc2ScaleSetRunners({
  runnerConfig,
  numberOfRunners,
  generateJitConfig,
  removeRunner,
}: CreateScaleSetRunnersInput): Promise<CreateRunnerResult> {
  validateScaleSetId(runnerConfig.scaleSetId);
  return await createConfiguredRunners(
    runnerConfig,
    loadEc2ScaleSetProviderConfig(),
    numberOfRunners,
    (config, runnerIds, options) =>
      configureScaleSetRunners(config, runnerIds, generateJitConfig, removeRunner, options),
    'scale-set-lambda',
    [
      { Key: SCALE_SET_ID_TAG_KEY, Value: String(runnerConfig.scaleSetId) },
      { Key: SCALE_SET_STATE_TAG_KEY, Value: 'provisioning' },
    ],
  );
}

async function terminateSurplusEc2ScaleSetRunners({
  runnerOwner,
  runnerType,
  scaleSetId,
  runnerNamePrefix,
  desiredRunners,
  excessRunners,
  ssmTokenPath,
  removeRunner,
}: TerminateSurplusScaleSetRunnersInput): Promise<number> {
  validateScaleSetId(scaleSetId);
  validateNonNegativeInteger(desiredRunners, 'desired runner count');
  validateNonNegativeInteger(excessRunners, 'excess runner count');
  if (excessRunners === 0) return 0;

  const runners = await listEC2Runners({
    environment: process.env.ENVIRONMENT,
    runnerOwner,
    runnerType,
    scaleSetId,
    source: 'scale-set-lambda',
  });
  const activeRunners = runners.filter(
    (runner) =>
      runner.scaleSetState !== 'stopped' &&
      runner.scaleSetState !== 'retiring' &&
      !((runner.scaleSetState === 'provisioning' || runner.scaleSetState === 'publishing') && bootTimeExceeded(runner)),
  );
  const maximumSafeTerminationCount = Math.min(excessRunners, Math.max(0, activeRunners.length - desiredRunners));
  if (maximumSafeTerminationCount === 0) return 0;

  const candidates = activeRunners
    .filter(
      (runner) =>
        !runner.bypassRemoval &&
        (runner.scaleSetState === 'provisioning' || runner.scaleSetState === 'config-published'),
    )
    .sort(compareSurplusCandidates);

  let terminatedRunners = 0;
  for (const runner of candidates) {
    if (terminatedRunners >= maximumSafeTerminationCount) break;

    const githubRunnerId = parseTaggedGitHubRunnerId(runner.githubRunnerId);
    if (githubRunnerId === undefined) {
      logger.warn('Protecting surplus scale-set compute without a valid GitHub runner ID', {
        runnerId: runner.id,
        runnerName: runner.runnerName,
        scaleSetId,
        githubRunnerId: runner.githubRunnerId,
      });
      continue;
    }

    const jitConfigParameter = `${ssmTokenPath}/${runner.id}`;
    if (!(await claimJitConfigForTermination(jitConfigParameter, runner.id, scaleSetId))) {
      continue;
    }

    logger.info('Terminating surplus non-running scale-set runner', {
      runnerId: runner.id,
      runnerName: runner.runnerName,
      scaleSetId,
      scaleSetState: runner.scaleSetState,
      jitConfigParameter,
      desiredRunners,
      excessRunners,
    });
    await tag(runner.id, [{ Key: SCALE_SET_STATE_TAG_KEY, Value: 'retiring' }]);
    await removeRunner({
      runnerId: githubRunnerId,
      runnerName: `${runnerNamePrefix}${runner.id}`,
      scaleSetId,
    });
    await terminateRunner(runner.id);
    terminatedRunners++;
  }

  if (terminatedRunners < maximumSafeTerminationCount) {
    logger.info('Scale-set surplus includes runners that cannot be terminated safely', {
      scaleSetId,
      desiredRunners,
      excessRunners,
      eligibleRunners: candidates.length,
      terminatedRunners,
    });
  }

  return terminatedRunners;
}

async function deleteStaleScaleSetJitConfig(
  parameterName: string,
  runnerId: string,
  scaleSetId: number,
): Promise<void> {
  try {
    await deleteParameter(parameterName);
  } catch (error) {
    if (isParameterNotFound(error)) {
      logger.info('No JIT config exists for stale scale-set runner', {
        runnerId,
        scaleSetId,
        jitConfigParameter: parameterName,
      });
      return;
    }
    throw error;
  }
}

async function claimJitConfigForTermination(
  parameterName: string,
  runnerId: string,
  scaleSetId: number,
): Promise<boolean> {
  try {
    await deleteParameter(parameterName);
    return true;
  } catch (error) {
    if (isParameterNotFound(error)) {
      // The bootstrap must delete this parameter before starting run.*. A missing
      // parameter is therefore ambiguous: the runner may already have claimed it.
      logger.info('Protecting scale-set runner because its JIT config is already absent', {
        runnerId,
        scaleSetId,
        jitConfigParameter: parameterName,
      });
      return false;
    }
    throw error;
  }
}

function isParameterNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'ParameterNotFound' || error.name === 'ParameterNotFoundException')
  );
}

function parseTaggedGitHubRunnerId(taggedRunnerId: string | undefined): number | undefined {
  if (taggedRunnerId === undefined) return undefined;
  const runnerId = Number(taggedRunnerId);
  return Number.isSafeInteger(runnerId) && runnerId > 0 ? runnerId : undefined;
}

async function removeRequiredTaggedGitHubRunner(
  taggedRunnerId: string | undefined,
  instanceId: string,
  expectedRunnerName: string,
  scaleSetId: number,
  removeRunner: RemoveScaleSetRunner,
): Promise<void> {
  const runnerId = parseTaggedGitHubRunnerId(taggedRunnerId);
  if (runnerId === undefined) {
    throw new Error(`Retiring scale-set instance '${instanceId}' has no valid GitHub runner ID tag`);
  }
  await removeRunner({ runnerId, runnerName: expectedRunnerName, scaleSetId });
}

function compareSurplusCandidates(
  left: { id: string; launchTime?: Date; scaleSetState?: ScaleSetRunnerState },
  right: { id: string; launchTime?: Date; scaleSetState?: ScaleSetRunnerState },
): number {
  const leftStatePriority = left.scaleSetState === 'provisioning' ? 0 : 1;
  const rightStatePriority = right.scaleSetState === 'provisioning' ? 0 : 1;
  if (leftStatePriority !== rightStatePriority) return leftStatePriority - rightStatePriority;

  const launchTimeOrder = (right.launchTime?.getTime() ?? 0) - (left.launchTime?.getTime() ?? 0);
  return launchTimeOrder !== 0 ? launchTimeOrder : left.id.localeCompare(right.id);
}

async function markEc2ScaleSetRunnerStarted({
  runnerName,
  runnerOwner,
  runnerType,
  scaleSetId,
}: MarkScaleSetRunnerStartedInput): Promise<void> {
  validateScaleSetId(scaleSetId);
  if (!runnerName.trim()) {
    throw new Error('A non-empty runner name is required to mark a scale-set runner started');
  }

  const matchingRunners = await listEC2Runners({
    environment: process.env.ENVIRONMENT,
    runnerOwner,
    runnerType,
    runnerName,
    scaleSetId,
    source: 'scale-set-lambda',
  });

  if (matchingRunners.length === 0) {
    logger.info(`No active EC2 scale-set runner found for started runner '${runnerName}'`);
    return;
  }
  if (matchingRunners.length > 1) {
    throw new Error(
      `Refusing to mark scale-set runner '${runnerName}' started: ${matchingRunners.length} scoped EC2 instances matched`,
    );
  }

  await tag(matchingRunners[0].id, [{ Key: SCALE_SET_STATE_TAG_KEY, Value: 'ready' }]);
}

async function terminateCompletedEc2ScaleSetRunner({
  runnerName,
  runnerOwner,
  runnerType,
  scaleSetId,
}: TerminateScaleSetRunnerInput): Promise<void> {
  validateScaleSetId(scaleSetId);
  if (!runnerName.trim()) {
    throw new Error('A non-empty runner name is required to terminate a completed scale-set runner');
  }

  const matchingRunners = await listEC2Runners({
    environment: process.env.ENVIRONMENT,
    runnerOwner,
    runnerType,
    runnerName,
    scaleSetId,
    source: 'scale-set-lambda',
  });

  if (matchingRunners.length === 0) {
    logger.info(`No active EC2 scale-set runner found for completed runner '${runnerName}'`);
    return;
  }
  if (matchingRunners.length > 1) {
    throw new Error(
      `Refusing to terminate scale-set runner '${runnerName}': ${matchingRunners.length} scoped EC2 instances matched`,
    );
  }

  await terminateRunner(matchingRunners[0].id);
}

function validateScaleSetId(scaleSetId: number): void {
  if (!Number.isInteger(scaleSetId) || scaleSetId <= 0) {
    throw new Error('A positive integer scale-set ID is required');
  }
}

function validateNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

export function createEc2ScaleSetProvider(): Omit<ScaleSetComputeProvider, 'type'> {
  return {
    getCurrentRunners: getCurrentEc2ScaleSetRunners,
    createRunners: createEc2ScaleSetRunners,
    terminateSurplusRunners: terminateSurplusEc2ScaleSetRunners,
    markRunnerStarted: markEc2ScaleSetRunnerStarted,
    terminateCompletedRunner: terminateCompletedEc2ScaleSetRunner,
  };
}

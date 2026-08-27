import { DeleteParameterCommand, PutParameterCommand, type SSMClient, type Tag as SsmTag } from '@aws-sdk/client-ssm';

import type { GenerateScaleSetJitConfigurationResult, ScaleSetReconcileRequest } from '../../../../scale-set';
import type { Ec2RunnerResourceOperations } from '../runners';
import type { CreateEc2ScaleSetProviderInput, Ec2ScaleSetProviderConfig } from './configuration';
import {
  EC2_GITHUB_RUNNER_ID_TAG,
  EC2_GITHUB_SCOPE_HASH_TAG,
  EC2_RUNNER_CONFIG_TAG,
  EC2_RUNNER_NAME_TAG,
  EC2_SCALE_SET_ID_TAG,
  EC2_SCALE_SET_STATE_TAG,
  GITHUB_RUNNER_NAME_MAX_LENGTH,
  githubScopeHash,
  ownershipTags,
  runnerIdentityFromGitHubScope,
  SCALE_SET_RUNNER_SOURCE,
} from './inventory';
import {
  Ec2ScaleSetValidationError,
  retainUnknown,
  safeError,
  throwIfAborted,
  type MutableReconcileState,
} from './reconcile';

const SSM_STANDARD_TIER_THRESHOLD = 4000;
const SSM_ADVANCED_TIER_MAX_BYTES = 8192;

function jitParameterName(config: Ec2ScaleSetProviderConfig, instanceId: string): string {
  return `${config.jitConfigParameterPath}/${instanceId}`;
}

function jitParameterTags(input: CreateEc2ScaleSetProviderInput, instanceId: string): SsmTag[] {
  const reserved = new Set(['InstanceId', EC2_RUNNER_CONFIG_TAG, EC2_SCALE_SET_ID_TAG, EC2_GITHUB_SCOPE_HASH_TAG]);
  return [
    ...(input.configuration.ssmParameterTags ?? []).filter((tag) => tag.Key && !reserved.has(tag.Key)),
    { Key: 'InstanceId', Value: instanceId },
    { Key: EC2_RUNNER_CONFIG_TAG, Value: input.runnerConfigName },
    { Key: EC2_SCALE_SET_ID_TAG, Value: String(input.scaleSetId) },
    { Key: EC2_GITHUB_SCOPE_HASH_TAG, Value: githubScopeHash(input.githubScope) },
  ];
}

async function publishJitConfiguration(
  input: CreateEc2ScaleSetProviderInput,
  instanceId: string,
  encodedJitConfiguration: string,
  ssmClient: SSMClient,
  signal: AbortSignal,
): Promise<void> {
  const valueSize = Buffer.byteLength(encodedJitConfiguration, 'utf8');
  if (valueSize === 0 || valueSize > SSM_ADVANCED_TIER_MAX_BYTES) {
    throw new Ec2ScaleSetValidationError('JIT configuration must be between 1 and 8192 bytes');
  }

  await ssmClient.send(
    new PutParameterCommand({
      Name: jitParameterName(input.configuration, instanceId),
      Value: encodedJitConfiguration,
      Type: 'SecureString',
      KeyId: input.configuration.ssmKmsKeyId,
      Overwrite: false,
      Tier: valueSize >= SSM_STANDARD_TIER_THRESHOLD ? 'Advanced' : 'Standard',
      Tags: jitParameterTags(input, instanceId),
    }),
    { abortSignal: signal },
  );
}

async function bestEffortCancelJitPublication(
  input: CreateEc2ScaleSetProviderInput,
  instanceId: string,
  ssmClient: SSMClient,
  signal: AbortSignal,
): Promise<void> {
  try {
    await ssmClient.send(new DeleteParameterCommand({ Name: jitParameterName(input.configuration, instanceId) }), {
      abortSignal: signal,
    });
  } catch (error) {
    throwIfAborted(signal, error);
  }
}

function validateJitResult(
  result: GenerateScaleSetJitConfigurationResult,
  expectedRunnerName: string,
  scaleSetId: number,
): void {
  if (
    !Number.isSafeInteger(result.runnerId) ||
    result.runnerId <= 0 ||
    result.runnerName !== expectedRunnerName ||
    result.scaleSetId !== scaleSetId
  ) {
    throw new Ec2ScaleSetValidationError('JIT configuration returned an unexpected runner identity');
  }
  const valueSize = Buffer.byteLength(result.encodedJitConfiguration, 'utf8');
  if (valueSize === 0 || valueSize > SSM_ADVANCED_TIER_MAX_BYTES) {
    throw new Ec2ScaleSetValidationError('JIT configuration has an invalid size');
  }
}

async function terminateUnpublishedRunner(
  instanceId: string,
  state: MutableReconcileState,
  runners: Ec2RunnerResourceOperations,
  signal: AbortSignal,
): Promise<void> {
  try {
    await runners.terminate(instanceId);
    state.currentRunners--;
    state.actions.terminated++;
  } catch (error) {
    throwIfAborted(signal, error);
    retainUnknown(state, instanceId);
    state.errors.push(safeError('terminate', error, { resourceId: instanceId }));
  }
}

async function cleanGitHubRunner(
  jit: GenerateScaleSetJitConfigurationResult,
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
): Promise<void> {
  try {
    await request.removeRunner({
      runnerId: jit.runnerId,
      runnerName: jit.runnerName,
      scaleSetId: jit.scaleSetId,
      signal: request.signal,
    });
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(safeError('remove_runner', error, { runnerName: jit.runnerName }));
  }
}

async function configureLaunchedRunner(
  input: CreateEc2ScaleSetProviderInput,
  instanceId: string,
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
  runners: Ec2RunnerResourceOperations,
  ssmClient: SSMClient,
): Promise<void> {
  const runnerName = `${input.configuration.runnerNamePrefix}${instanceId}`;
  if (runnerName.length > GITHUB_RUNNER_NAME_MAX_LENGTH) {
    state.errors.push({
      operation: 'generate_jit_configuration',
      code: 'RUNNER_NAME_TOO_LONG',
      resourceId: instanceId,
    });
    await terminateUnpublishedRunner(instanceId, state, runners, request.signal);
    return;
  }

  let jit: GenerateScaleSetJitConfigurationResult;
  try {
    jit = await request.generateJitConfiguration({ runnerName, signal: request.signal });
    validateJitResult(jit, runnerName, input.scaleSetId);
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(safeError('generate_jit_configuration', error, { runnerName, resourceId: instanceId }));
    await terminateUnpublishedRunner(instanceId, state, runners, request.signal);
    return;
  }

  try {
    await runners.tag(instanceId, [
      { Key: EC2_RUNNER_NAME_TAG, Value: jit.runnerName },
      { Key: EC2_GITHUB_RUNNER_ID_TAG, Value: String(jit.runnerId) },
      { Key: EC2_SCALE_SET_STATE_TAG, Value: 'publishing' },
    ]);
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(safeError('launch', error, { runnerName, resourceId: instanceId }));
    await cleanGitHubRunner(jit, request, state);
    await terminateUnpublishedRunner(instanceId, state, runners, request.signal);
    return;
  }

  try {
    await publishJitConfiguration(input, instanceId, jit.encodedJitConfiguration, ssmClient, request.signal);
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(safeError('publish_jit_configuration', error, { runnerName, resourceId: instanceId }));
    await bestEffortCancelJitPublication(input, instanceId, ssmClient, request.signal);
    // Main's bootstrap reads before deleting. Even a successful controller-side
    // DeleteParameter can race after that read and cannot prove non-consumption.
    // Preserve both GitHub and compute state until an exact lifecycle signal is observed.
    retainUnknown(state, instanceId);
    return;
  }

  state.actions.launched++;
  try {
    await runners.tag(instanceId, [{ Key: EC2_SCALE_SET_STATE_TAG, Value: 'config-published' }]);
  } catch (error) {
    throwIfAborted(request.signal, error);
    // Publication may already have been consumed. Preserve the instance and exact GitHub identity.
    retainUnknown(state, instanceId);
    state.errors.push(safeError('launch', error, { runnerName, resourceId: instanceId }));
  }
}

export async function scaleUp(
  input: CreateEc2ScaleSetProviderInput,
  count: number,
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
  runners: Ec2RunnerResourceOperations,
  ssmClient: SSMClient,
): Promise<void> {
  const runnerIdentity = runnerIdentityFromGitHubScope(input.githubScope);
  let createResult;
  try {
    createResult = await runners.create({
      environment: input.configuration.environment,
      runnerOwner: runnerIdentity.runnerOwner,
      runnerType: runnerIdentity.runnerType,
      subnets: input.configuration.subnets,
      launchTemplateName: input.configuration.launchTemplateName,
      ec2instanceCriteria: input.configuration.ec2instanceCriteria,
      ec2OverrideConfig: input.configuration.ec2OverrideConfig,
      numberOfRunners: count,
      source: SCALE_SET_RUNNER_SOURCE,
      amiIdSsmParameterName: input.configuration.amiIdSsmParameterName,
      tracingEnabled: input.configuration.tracingEnabled,
      onDemandFailoverOnError: input.configuration.onDemandFailoverOnError,
      useDedicatedHost: input.configuration.useDedicatedHost,
      orchestrationTags: ownershipTags(input),
    });
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(safeError('launch', error));
    return;
  }

  state.currentRunners += createResult.instances.length;
  if (createResult.failedInstanceCount > 0) {
    state.errors.push({ operation: 'launch', code: 'EC2_LAUNCH_FAILED' });
  }

  for (const instanceId of createResult.instances) {
    request.signal.throwIfAborted();
    await configureLaunchedRunner(input, instanceId, request, state, runners, ssmClient);
  }
}

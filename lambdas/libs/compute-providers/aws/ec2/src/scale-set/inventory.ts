import { createHash } from 'node:crypto';

import { DescribeInstancesCommand, type EC2Client, type Instance, type Tag } from '@aws-sdk/client-ec2';

import type { ScaleSetReconcileRequest, ScaleSetRunnerState } from '../../../../scale-set';
import type { CreateEc2ScaleSetProviderInput } from './configuration';
import { retainUnknown, type MutableReconcileState } from './reconcile';

export const EC2_RUNNER_CONFIG_TAG = 'ghr:runner_config';
export const EC2_SCALE_SET_ID_TAG = 'ghr:scale_set_id';
export const EC2_GITHUB_SCOPE_HASH_TAG = 'ghr:github_scope_hash';
export const EC2_SCALE_SET_STATE_TAG = 'ghr:scale_set_state';
export const EC2_RUNNER_NAME_TAG = 'ghr:runner_name';
export const EC2_GITHUB_RUNNER_ID_TAG = 'ghr:github_runner_id';

const APPLICATION_TAG = 'ghr:Application';
const APPLICATION_VALUE = 'github-action-runner';
const CREATED_BY_TAG = 'ghr:created_by';
export const SCALE_SET_RUNNER_SOURCE = 'scale-set-service';
const ENVIRONMENT_TAG = 'ghr:environment';
export const GITHUB_RUNNER_NAME_MAX_LENGTH = 64;

type Ec2ScaleSetState = 'provisioning' | 'publishing' | 'config-published' | 'retiring';

export interface OwnedEc2Runner {
  instanceId: string;
  launchTime?: Date;
  githubRunnerId?: number;
  runnerName?: string;
  scaleSetState?: Ec2ScaleSetState;
}

export function githubScopeHash(githubScope: string): string {
  return createHash('sha256').update(githubScope, 'utf8').digest('hex');
}

export function runnerIdentityFromGitHubScope(githubScope: string): {
  runnerOwner: string;
  runnerType: 'Org' | 'Repo';
} {
  const pathParts = new URL(githubScope).pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (pathParts.length === 2 && pathParts[0].toLowerCase() !== 'enterprises') {
    return { runnerOwner: pathParts.join('/'), runnerType: 'Repo' };
  }

  // The legacy EC2 tags do not have an enterprise discriminator. They remain
  // informational here; exact ownership is fenced by runner config, scale-set
  // ID, and the canonical GitHub-scope hash.
  return {
    runnerOwner: pathParts[0].toLowerCase() === 'enterprises' ? pathParts[1] : pathParts[0],
    runnerType: 'Org',
  };
}

export function ownershipTags(input: CreateEc2ScaleSetProviderInput): Tag[] {
  return [
    { Key: ENVIRONMENT_TAG, Value: input.configuration.environment },
    { Key: EC2_RUNNER_CONFIG_TAG, Value: input.runnerConfigName },
    { Key: EC2_SCALE_SET_ID_TAG, Value: String(input.scaleSetId) },
    { Key: EC2_GITHUB_SCOPE_HASH_TAG, Value: githubScopeHash(input.githubScope) },
  ];
}

export async function listOwnedRunners(
  input: CreateEc2ScaleSetProviderInput,
  ec2Client: EC2Client,
  signal: AbortSignal,
): Promise<OwnedEc2Runner[]> {
  const runners: OwnedEc2Runner[] = [];
  let nextToken: string | undefined;
  do {
    const response = await ec2Client.send(
      new DescribeInstancesCommand({
        Filters: [
          { Name: 'instance-state-name', Values: ['pending', 'running'] },
          { Name: `tag:${APPLICATION_TAG}`, Values: [APPLICATION_VALUE] },
          { Name: `tag:${CREATED_BY_TAG}`, Values: [SCALE_SET_RUNNER_SOURCE] },
          { Name: `tag:${ENVIRONMENT_TAG}`, Values: [input.configuration.environment] },
          { Name: `tag:${EC2_RUNNER_CONFIG_TAG}`, Values: [input.runnerConfigName] },
          { Name: `tag:${EC2_SCALE_SET_ID_TAG}`, Values: [String(input.scaleSetId)] },
          { Name: `tag:${EC2_GITHUB_SCOPE_HASH_TAG}`, Values: [githubScopeHash(input.githubScope)] },
        ],
        NextToken: nextToken,
      }),
      { abortSignal: signal },
    );
    nextToken = response.NextToken;

    for (const instance of response.Reservations?.flatMap((reservation) => reservation.Instances ?? []) ?? []) {
      const runner = parseOwnedRunner(instance, input);
      if (runner) runners.push(runner);
    }
  } while (nextToken);

  return runners;
}

function parseOwnedRunner(instance: Instance, input: CreateEc2ScaleSetProviderInput): OwnedEc2Runner | undefined {
  if (!instance.InstanceId) return undefined;
  const tags = new Map((instance.Tags ?? []).flatMap((tag) => (tag.Key ? [[tag.Key, tag.Value]] : [])));

  if (
    tags.get(APPLICATION_TAG) !== APPLICATION_VALUE ||
    tags.get(CREATED_BY_TAG) !== SCALE_SET_RUNNER_SOURCE ||
    tags.get(ENVIRONMENT_TAG) !== input.configuration.environment ||
    tags.get(EC2_RUNNER_CONFIG_TAG) !== input.runnerConfigName ||
    tags.get(EC2_SCALE_SET_ID_TAG) !== String(input.scaleSetId) ||
    tags.get(EC2_GITHUB_SCOPE_HASH_TAG) !== githubScopeHash(input.githubScope)
  ) {
    return undefined;
  }

  const taggedRunnerId = tags.get(EC2_GITHUB_RUNNER_ID_TAG);
  const githubRunnerId = taggedRunnerId === undefined ? undefined : Number(taggedRunnerId);
  const rawScaleSetState = tags.get(EC2_SCALE_SET_STATE_TAG);
  const scaleSetState = ['provisioning', 'publishing', 'config-published', 'retiring'].includes(rawScaleSetState ?? '')
    ? (rawScaleSetState as Ec2ScaleSetState)
    : undefined;

  return {
    instanceId: instance.InstanceId,
    launchTime: instance.LaunchTime,
    githubRunnerId: Number.isSafeInteger(githubRunnerId) && githubRunnerId! > 0 ? githubRunnerId : undefined,
    runnerName: tags.get(EC2_RUNNER_NAME_TAG),
    scaleSetState,
  };
}

function validRunnerState(value: ScaleSetRunnerState): boolean {
  return (
    Number.isSafeInteger(value.runnerId) &&
    value.runnerId > 0 &&
    Number.isSafeInteger(value.scaleSetId) &&
    value.scaleSetId > 0 &&
    typeof value.runnerName === 'string' &&
    value.runnerName.length > 0 &&
    value.runnerName.length <= GITHUB_RUNNER_NAME_MAX_LENGTH &&
    ['online', 'offline', 'unknown'].includes(value.status) &&
    (typeof value.busy === 'boolean' || value.busy === undefined) &&
    ['started', 'completed', 'unknown'].includes(value.lifecycle)
  );
}

export function indexRunnerStates(
  runnerStates: readonly ScaleSetRunnerState[],
  scaleSetId: number,
): { byName: Map<string, ScaleSetRunnerState>; ambiguousNames: Set<string>; ambiguousIds: Set<number> } {
  const byName = new Map<string, ScaleSetRunnerState>();
  const byId = new Map<number, string>();
  const ambiguousNames = new Set<string>();
  const ambiguousIds = new Set<number>();

  for (const state of runnerStates) {
    if (!validRunnerState(state) || state.scaleSetId !== scaleSetId) continue;
    if (byName.has(state.runnerName)) ambiguousNames.add(state.runnerName);
    const existingName = byId.get(state.runnerId);
    if (existingName !== undefined && existingName !== state.runnerName) {
      ambiguousIds.add(state.runnerId);
      ambiguousNames.add(existingName);
      ambiguousNames.add(state.runnerName);
    }
    byName.set(state.runnerName, state);
    byId.set(state.runnerId, state.runnerName);
  }
  return { byName, ambiguousNames, ambiguousIds };
}

export function matchingRunnerState(
  runner: OwnedEc2Runner,
  index: ReturnType<typeof indexRunnerStates>,
  scaleSetId: number,
): ScaleSetRunnerState | undefined {
  if (!runner.runnerName || !runner.githubRunnerId) return undefined;
  if (index.ambiguousNames.has(runner.runnerName) || index.ambiguousIds.has(runner.githubRunnerId)) return undefined;
  const state = index.byName.get(runner.runnerName);
  if (
    !state ||
    state.runnerId !== runner.githubRunnerId ||
    state.runnerName !== runner.runnerName ||
    state.scaleSetId !== scaleSetId
  ) {
    return undefined;
  }
  return state;
}

function isWithinBootTimeout(runner: OwnedEc2Runner, bootTimeoutMinutes: number, now: number): boolean {
  const launchTime = runner.launchTime?.getTime();
  if (launchTime === undefined || !Number.isFinite(launchTime)) return false;
  const ageMilliseconds = now - launchTime;
  return ageMilliseconds >= 0 && ageMilliseconds < bootTimeoutMinutes * 60_000;
}

function isConfirmedServingState(state: ScaleSetRunnerState): boolean {
  return state.lifecycle === 'started' || state.status === 'online';
}

export function servingCapacity(
  input: CreateEc2ScaleSetProviderInput,
  runners: readonly OwnedEc2Runner[],
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
  now: number,
): OwnedEc2Runner[] {
  const runnerStateIndex = indexRunnerStates(request.runnerStates, input.scaleSetId);
  const serving: OwnedEc2Runner[] = [];

  for (const runner of runners) {
    if (runner.scaleSetState !== 'config-published') {
      // An interrupted publication may already have been consumed. Preserve it,
      // but do not let it suppress replacement capacity indefinitely.
      retainUnknown(state, runner.instanceId);
      continue;
    }

    const githubState = matchingRunnerState(runner, runnerStateIndex, input.scaleSetId);
    if (githubState !== undefined && isConfirmedServingState(githubState)) {
      serving.push(runner);
      continue;
    }
    if (isWithinBootTimeout(runner, request.bootTimeoutMinutes, now)) {
      serving.push(runner);
      continue;
    }

    retainUnknown(state, runner.instanceId);
    if (!request.runnerInventoryComplete) {
      // Treat the stale handoff provisionally as serving until the controller
      // supplies one complete joined inventory. This avoids a blind replacement
      // before GitHub identity can be checked.
      state.needsRunnerInventory = true;
      serving.push(runner);
    }
  }

  return serving;
}

export function isSafeScaleDownState(state: ScaleSetRunnerState): boolean {
  return (
    (state.lifecycle === 'completed' && state.busy !== true) ||
    (state.lifecycle !== 'started' && state.status === 'online' && state.busy === false)
  );
}

export function isBusyState(state: ScaleSetRunnerState): boolean {
  return state.lifecycle === 'started' || state.busy === true;
}

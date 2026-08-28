import type { ScaleSetReconcileRequest, ScaleSetRunnerState } from '../../../../scale-set';
import type { Ec2RunnerResourceOperations } from '../runners';
import type { CreateEc2ScaleSetProviderInput } from './configuration';
import {
  indexRunnerStates,
  isBusyState,
  isSafeScaleDownState,
  matchingRunnerState,
  type OwnedEc2Runner,
} from './inventory';
import { retainUnknown, safeError, throwIfAborted, type MutableReconcileState } from './reconcile';

async function terminateKnownIdleRunner(
  runner: OwnedEc2Runner,
  githubState: ScaleSetRunnerState,
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
  runnerOperations: Ec2RunnerResourceOperations,
): Promise<boolean> {
  let removalResult;
  try {
    removalResult = await request.removeRunner({
      runnerId: githubState.runnerId,
      runnerName: githubState.runnerName,
      scaleSetId: githubState.scaleSetId,
      signal: request.signal,
    });
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(
      safeError('remove_runner', error, { runnerName: githubState.runnerName, resourceId: runner.instanceId }),
    );
    retainUnknown(state, runner.instanceId);
    return false;
  }

  if (removalResult.status === 'retained_busy') {
    state.actions.retainedBusy++;
    return false;
  }
  if (removalResult.status !== 'removed') {
    retainUnknown(state, runner.instanceId);
    if (!request.runnerInventoryComplete) state.needsRunnerInventory = true;
    return false;
  }

  try {
    await runnerOperations.terminate(runner.instanceId);
    state.currentRunners--;
    state.actions.terminated++;
    return true;
  } catch (error) {
    throwIfAborted(request.signal, error);
    state.errors.push(
      safeError('terminate', error, { runnerName: githubState.runnerName, resourceId: runner.instanceId }),
    );
    retainUnknown(state, runner.instanceId);
    return false;
  }
}

export async function scaleDown(
  input: CreateEc2ScaleSetProviderInput,
  runners: readonly OwnedEc2Runner[],
  count: number,
  request: ScaleSetReconcileRequest,
  state: MutableReconcileState,
  runnerOperations: Ec2RunnerResourceOperations,
): Promise<void> {
  const runnerStateIndex = indexRunnerStates(request.runnerStates, input.scaleSetId);
  const candidates: { runner: OwnedEc2Runner; githubState: ScaleSetRunnerState }[] = [];

  for (const runner of runners) {
    const githubState = matchingRunnerState(runner, runnerStateIndex, input.scaleSetId);
    if (!githubState) {
      retainUnknown(state, runner.instanceId);
      if (!request.runnerInventoryComplete) state.needsRunnerInventory = true;
    } else if (isBusyState(githubState)) {
      state.actions.retainedBusy++;
    } else if (isSafeScaleDownState(githubState, request.recoveryOnly)) {
      candidates.push({ runner, githubState });
    } else {
      retainUnknown(state, runner.instanceId);
      if (!request.runnerInventoryComplete) state.needsRunnerInventory = true;
    }
  }

  candidates.sort((left, right) => {
    const launchOrder = (right.runner.launchTime?.getTime() ?? 0) - (left.runner.launchTime?.getTime() ?? 0);
    return launchOrder || left.runner.instanceId.localeCompare(right.runner.instanceId);
  });

  let remaining = count;
  for (const candidate of candidates) {
    if (remaining === 0) break;
    request.signal.throwIfAborted();
    if (await terminateKnownIdleRunner(candidate.runner, candidate.githubState, request, state, runnerOperations)) {
      remaining--;
    }
  }
}

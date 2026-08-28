import { EC2Client } from '@aws-sdk/client-ec2';
import { SSMClient } from '@aws-sdk/client-ssm';

import type { ScaleSetComputeProvider, ScaleSetReconcileResult } from '../../../../scale-set';
import { createEc2RunnerClient } from '../runners';
import {
  parseEc2ScaleSetProviderConfig,
  validateFactoryInput,
  type CreateEc2ScaleSetProviderInput,
  type Ec2ScaleSetProviderConfig,
} from './configuration';
import { listOwnedRunners, servingCapacity, type OwnedEc2Runner } from './inventory';
import {
  emptyState,
  finish,
  safeError,
  throwIfAborted,
  validateBootTimeout,
  validateDesiredRunners,
  validateInventorySignal,
} from './reconcile';
import { scaleDown } from './scale-down';
import { scaleUp } from './scale-up';

export type { CreateEc2ScaleSetProviderInput, Ec2ScaleSetProviderConfig } from './configuration';
export { parseEc2ScaleSetProviderConfig } from './configuration';
export {
  EC2_GITHUB_RUNNER_ID_TAG,
  EC2_GITHUB_SCOPE_HASH_TAG,
  EC2_RUNNER_CONFIG_TAG,
  EC2_RUNNER_NAME_TAG,
  EC2_SCALE_SET_ID_TAG,
  EC2_SCALE_SET_STATE_TAG,
} from './inventory';

const RETAINED_CAPACITY_REPLACEMENT_SURGE = 1;

export interface Ec2ScaleSetProviderDependencies {
  ec2Client?: EC2Client;
  ssmClient?: SSMClient;
  now?: () => number;
}

function createClients(config: Ec2ScaleSetProviderConfig, dependencies: Ec2ScaleSetProviderDependencies) {
  return {
    ec2Client: dependencies.ec2Client ?? new EC2Client({ region: config.region }),
    ssmClient:
      dependencies.ssmClient ??
      new SSMClient({
        region: config.region,
        maxAttempts: 10,
        retryMode: 'adaptive',
      }),
  };
}

export function createEc2ScaleSetProvider(
  input: CreateEc2ScaleSetProviderInput,
  dependencies: Ec2ScaleSetProviderDependencies = {},
): ScaleSetComputeProvider {
  const normalizedInput = {
    ...input,
    configuration: parseEc2ScaleSetProviderConfig(input.configuration),
  };
  validateFactoryInput(normalizedInput);
  const clients = createClients(normalizedInput.configuration, dependencies);
  const runnerClient = createEc2RunnerClient(clients.ec2Client);
  const now = dependencies.now ?? Date.now;

  return {
    async reconcile(request): Promise<ScaleSetReconcileResult> {
      request.signal.throwIfAborted();
      const validationError =
        validateDesiredRunners(request.desiredRunners) ??
        validateBootTimeout(request.bootTimeoutMinutes) ??
        validateInventorySignal(request.runnerInventoryComplete);
      if (validationError) {
        const state = emptyState(0);
        state.errors.push(validationError);
        return finish(state, request.desiredRunners);
      }

      const runnerOperations = runnerClient.forRequest({ signal: request.signal });
      let ownedRunners: OwnedEc2Runner[];
      try {
        ownedRunners = await listOwnedRunners(normalizedInput, clients.ec2Client, request.signal);
      } catch (error) {
        throwIfAborted(request.signal, error);
        const state = emptyState(0);
        state.errors.push(safeError('list', error));
        return finish(state, request.desiredRunners);
      }

      const state = emptyState(ownedRunners.length);
      const servingRunners = servingCapacity(normalizedInput, ownedRunners, request, state, now());

      if (request.recoveryOnly) {
        if (!request.runnerInventoryComplete) {
          state.needsRunnerInventory = true;
        } else if (servingRunners.length > 0) {
          await scaleDown(normalizedInput, servingRunners, servingRunners.length, request, state, runnerOperations);
        }
      } else if (servingRunners.length < request.desiredRunners) {
        const capacityDeficit = request.desiredRunners - servingRunners.length;
        const availableReplacementSlots = Math.max(
          0,
          request.desiredRunners + RETAINED_CAPACITY_REPLACEMENT_SURGE - ownedRunners.length,
        );
        const launchCount = Math.min(capacityDeficit, availableReplacementSlots);
        if (launchCount > 0) {
          await scaleUp(normalizedInput, launchCount, request, state, runnerOperations, clients.ssmClient);
        }
      } else if (servingRunners.length > request.desiredRunners) {
        await scaleDown(
          normalizedInput,
          servingRunners,
          servingRunners.length - request.desiredRunners,
          request,
          state,
          runnerOperations,
        );
      }

      return finish(state, request.desiredRunners);
    },
  };
}

import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import type {
  CreatePoolRunnersInput,
  CreateStartRunnerConfig,
  ListPoolRunnersInput,
  PoolComputeProvider,
  RunnerStatus,
} from '../../../../core';
import type { MicrovmRunnerInfo } from './microvms';
import { listMicrovmRunners, microvmBootTimeExceeded } from './microvms';
import { createMicrovmRunners } from './runner-config';

const logger = createChildLogger('microvm-pool');

async function listMicrovmPoolRunners(input: ListPoolRunnersInput): Promise<MicrovmRunnerInfo[]> {
  return await listMicrovmRunners(input);
}

async function createMicrovmPoolRunners(
  { githubRunnerConfig, numberOfRunners, githubInstallationClient }: CreatePoolRunnersInput,
  createStartRunnerConfig: CreateStartRunnerConfig,
): Promise<string[]> {
  const result = await createMicrovmRunners(
    githubRunnerConfig,
    numberOfRunners,
    githubInstallationClient,
    createStartRunnerConfig,
    'pool-lambda',
  );
  return result.instances;
}

export function calculateMicrovmPoolSize(
  runners: MicrovmRunnerInfo[],
  runnerStatus: Map<string, RunnerStatus>,
  includeBusyRunners = false,
): number {
  let availableRunners = 0;

  for (const runner of runners) {
    const status = runnerStatus.get(runner.id);
    if (runner.state === 'RUNNING' && status?.status === 'online' && (!status.busy || includeBusyRunners)) {
      availableRunners++;
      logger.debug(`MicroVM runner ${runner.id} is online and counted as part of the pool`);
    } else if (runner.state === 'PENDING' && !microvmBootTimeExceeded(runner)) {
      availableRunners++;
      logger.info(`MicroVM runner ${runner.id} is still booting and counted as part of the pool`);
    } else {
      logger.debug(`MicroVM runner ${runner.id} is not available and is not counted as part of the pool`);
    }
  }

  return availableRunners;
}

export function createMicrovmPoolProvider(
  createStartRunnerConfig: CreateStartRunnerConfig,
): Omit<PoolComputeProvider<MicrovmRunnerInfo>, 'type'> {
  return {
    listRunners: listMicrovmPoolRunners,
    countAvailableRunners: calculateMicrovmPoolSize,
    createRunners: (input) => createMicrovmPoolRunners(input, createStartRunnerConfig),
  };
}

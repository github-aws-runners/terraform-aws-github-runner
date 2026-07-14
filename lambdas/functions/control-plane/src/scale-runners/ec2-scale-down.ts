import { bootTimeExceeded, listEC2Runners, tag, terminateRunner, untag } from './../aws/ec2-runners';
import type { RunnerList } from './../aws/ec2-runners.d';
import type {
  RunnerList as ScaleDownRunnerList,
  ScaleDownRunnerProvider,
  ScaleDownRunnerProviderStrategy,
} from './scale-down-provider';

export function createEc2ScaleDownProvider(): ScaleDownRunnerProvider {
  return {
    type: 'ec2',
    name: 'EC2',
    list: async (environment, orphan) => (await listEC2Runners({ environment, orphan })).map(toScaleDownRunner),
    bootTimeExceeded,
    markOrphan: async (id) => await tag(id, [{ Key: 'ghr:orphan', Value: 'true' }]),
    unmarkOrphan: async (id) => await untag(id, [{ Key: 'ghr:orphan', Value: 'true' }]),
    terminate: terminateRunner,
  };
}

export const ec2ScaleDownRunnerProviderStrategy: ScaleDownRunnerProviderStrategy = {
  type: 'ec2',
  createFromEnv: createEc2ScaleDownProvider,
};

function toScaleDownRunner(runner: RunnerList): ScaleDownRunnerList {
  return {
    id: runner.instanceId,
    launchTime: runner.launchTime,
    owner: runner.owner,
    type: runner.type,
    repo: runner.repo,
    org: runner.org,
    orphan: runner.orphan,
    githubRunnerId: runner.runnerId,
    bypassRemoval: runner.bypassRemoval,
  };
}

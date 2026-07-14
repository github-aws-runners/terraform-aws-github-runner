import { bootTimeExceeded, listEC2Runners, tag, terminateRunner, untag } from './../aws/ec2-runners';
import type { RunnerList } from './../aws/ec2-runners.d';
import type { RunnerList as ScaleDownRunnerList, ScaleDownRunnerProvider } from './scale-down-provider';

async function listEc2ScaleDownRunners(environment: string, orphan?: boolean): Promise<ScaleDownRunnerList[]> {
  return (await listEC2Runners({ environment, orphan })).map(toScaleDownRunner);
}

async function markEc2RunnerOrphan(id: string): Promise<void> {
  await tag(id, [{ Key: 'ghr:orphan', Value: 'true' }]);
}

async function unmarkEc2RunnerOrphan(id: string): Promise<void> {
  await untag(id, [{ Key: 'ghr:orphan', Value: 'true' }]);
}

export function createEc2ScaleDownProvider(): ScaleDownRunnerProvider {
  return {
    type: 'ec2',
    list: listEc2ScaleDownRunners,
    bootTimeExceeded,
    markOrphan: markEc2RunnerOrphan,
    unmarkOrphan: unmarkEc2RunnerOrphan,
    terminate: terminateRunner,
  };
}

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

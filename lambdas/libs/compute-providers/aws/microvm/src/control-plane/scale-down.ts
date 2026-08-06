import type { ScaleDownComputeProvider } from '../../../../core';
import { loadMicrovmProviderConfig } from './config';
import type { MicrovmRunnerInfo } from './microvms';
import { listMicrovmRunners, microvmBootTimeExceeded, tagMicrovm, terminateMicrovm, untagMicrovm } from './microvms';

export function createMicrovmScaleDownProvider(): Omit<ScaleDownComputeProvider, 'type'> {
  const imageArnByRunnerId = new Map<string, string>();

  async function list(environment: string, orphan?: boolean): Promise<MicrovmRunnerInfo[]> {
    const runners = await listMicrovmRunners({ environment, orphan });
    for (const runner of runners) {
      if (runner.imageArn) imageArnByRunnerId.set(runner.id, runner.imageArn);
    }
    return runners;
  }

  function imageArnForRunner(id: string): string {
    return imageArnByRunnerId.get(id) ?? loadMicrovmProviderConfig().imageIdentifier;
  }

  return {
    list,
    bootTimeExceeded: microvmBootTimeExceeded,
    markOrphan: async (id) => await tagMicrovm(imageArnForRunner(id), id, { 'ghr:orphan': 'true' }),
    unmarkOrphan: async (id) => await untagMicrovm(imageArnForRunner(id), id, ['ghr:orphan']),
    terminate: terminateMicrovm,
  };
}

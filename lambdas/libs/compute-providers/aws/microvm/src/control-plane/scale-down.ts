import type { ScaleDownComputeProvider } from '../../../../core';
import { loadMicrovmProviderConfig } from './config';
import type { MicrovmRunnerInfo } from './microvms';
import { listMicrovmRunners, microvmBootTimeExceeded, terminateMicrovm } from './microvms';
import { setMicrovmOrphan } from './runner-metadata';

export function createMicrovmScaleDownProvider(): Omit<ScaleDownComputeProvider, 'type'> {
  const ssmPaths = () => loadMicrovmProviderConfig();

  async function list(environment: string, orphan?: boolean): Promise<MicrovmRunnerInfo[]> {
    return await listMicrovmRunners({ environment, orphan }, ssmPaths());
  }

  return {
    list,
    bootTimeExceeded: microvmBootTimeExceeded,
    markOrphan: async (id) => await setMicrovmOrphan(ssmPaths().metadataSsmPath, id, true),
    unmarkOrphan: async (id) => await setMicrovmOrphan(ssmPaths().metadataSsmPath, id, false),
    terminate: async (id) => await terminateMicrovm(id, ssmPaths()),
  };
}

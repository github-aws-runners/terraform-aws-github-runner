import type { ScaleDownComputeProvider } from '../../../../core';
import { loadMicrovmProviderConfig } from './config';
import type { MicrovmRunnerInfo } from './microvms';
import { listMicrovmRunners, microvmBootTimeExceeded, terminateMicrovm } from './microvms';
import { clearMicrovmIdleDetectedAt, setMicrovmIdleDetectedAt, setMicrovmOrphan } from './runner-metadata';

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
    markIdle: async (id, at) => await setMicrovmIdleDetectedAt(ssmPaths().metadataSsmPath, id, at),
    unmarkIdle: async (id) => await clearMicrovmIdleDetectedAt(ssmPaths().metadataSsmPath, id),
    terminate: async (id) => await terminateMicrovm(id, ssmPaths()),
  };
}

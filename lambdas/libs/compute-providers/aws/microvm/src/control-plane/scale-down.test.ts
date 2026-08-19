import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadMicrovmProviderConfig } from './config';
import { listMicrovmRunners, microvmBootTimeExceeded, terminateMicrovm } from './microvms';
import { createMicrovmScaleDownProvider } from './scale-down';
import { setMicrovmOrphan } from './runner-metadata';

vi.mock('./config', () => ({ loadMicrovmProviderConfig: vi.fn() }));
vi.mock('./microvms', () => ({
  listMicrovmRunners: vi.fn(),
  microvmBootTimeExceeded: vi.fn(),
  terminateMicrovm: vi.fn(),
}));
vi.mock('./runner-metadata', () => ({ setMicrovmOrphan: vi.fn() }));

const imageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner';
const metadataSsmPath = '/github-action-runners/unit-test/microvm-metadata';
const providerConfig = {
  imageIdentifier: imageArn,
  executionRoleArn: 'arn:aws:iam::123456789012:role/microvm-runner',
  maximumDurationInSeconds: 1200,
  metadataSsmPath,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadMicrovmProviderConfig).mockReturnValue(providerConfig);
  vi.mocked(listMicrovmRunners).mockResolvedValue([]);
  vi.mocked(microvmBootTimeExceeded).mockReturnValue(false);
  vi.mocked(setMicrovmOrphan).mockResolvedValue();
  vi.mocked(terminateMicrovm).mockResolvedValue();
});

describe('createMicrovmScaleDownProvider', () => {
  it('lists active and orphan runners through provider filters', async () => {
    const provider = createMicrovmScaleDownProvider();

    await provider.list('unit-test');
    await provider.list('unit-test', true);

    expect(listMicrovmRunners).toHaveBeenNthCalledWith(
      1,
      {
        environment: 'unit-test',
        orphan: undefined,
      },
      metadataSsmPath,
    );
    expect(listMicrovmRunners).toHaveBeenNthCalledWith(
      2,
      {
        environment: 'unit-test',
        orphan: true,
      },
      metadataSsmPath,
    );
  });

  it('uses durable metadata when marking, unmarking, and terminating runners', async () => {
    const provider = createMicrovmScaleDownProvider();

    await provider.markOrphan('mvm-1');
    await provider.unmarkOrphan('mvm-1');
    await provider.terminate('mvm-1');

    expect(setMicrovmOrphan).toHaveBeenNthCalledWith(1, metadataSsmPath, 'mvm-1', true);
    expect(setMicrovmOrphan).toHaveBeenNthCalledWith(2, metadataSsmPath, 'mvm-1', false);
    expect(terminateMicrovm).toHaveBeenCalledWith('mvm-1', metadataSsmPath);
  });

  it('uses the MicroVM boot-time policy', () => {
    const provider = createMicrovmScaleDownProvider();
    const runner = { id: 'mvm-1', owner: 'Codertocat', type: 'Org' as const };

    expect(provider.bootTimeExceeded(runner)).toBe(false);
    expect(microvmBootTimeExceeded).toHaveBeenCalledWith(runner);
  });
});

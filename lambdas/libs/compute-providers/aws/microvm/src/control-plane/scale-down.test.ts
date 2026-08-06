import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadMicrovmProviderConfig } from './config';
import { listMicrovmRunners, microvmBootTimeExceeded, tagMicrovm, terminateMicrovm, untagMicrovm } from './microvms';
import { createMicrovmScaleDownProvider } from './scale-down';

vi.mock('./config', () => ({ loadMicrovmProviderConfig: vi.fn() }));
vi.mock('./microvms', () => ({
  listMicrovmRunners: vi.fn(),
  microvmBootTimeExceeded: vi.fn(),
  tagMicrovm: vi.fn(),
  terminateMicrovm: vi.fn(),
  untagMicrovm: vi.fn(),
}));

const imageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner';
const overrideImageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-large';
const providerConfig = {
  imageIdentifier: imageArn,
  executionRoleArn: 'arn:aws:iam::123456789012:role/microvm-runner',
  maximumDurationInSeconds: 1200,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadMicrovmProviderConfig).mockReturnValue(providerConfig);
  vi.mocked(listMicrovmRunners).mockResolvedValue([]);
  vi.mocked(microvmBootTimeExceeded).mockReturnValue(false);
  vi.mocked(tagMicrovm).mockResolvedValue();
  vi.mocked(untagMicrovm).mockResolvedValue();
  vi.mocked(terminateMicrovm).mockResolvedValue();
});

describe('createMicrovmScaleDownProvider', () => {
  it('lists active and orphan runners through provider filters', async () => {
    const provider = createMicrovmScaleDownProvider();

    await provider.list('unit-test');
    await provider.list('unit-test', true);

    expect(listMicrovmRunners).toHaveBeenNthCalledWith(1, {
      environment: 'unit-test',
      orphan: undefined,
    });
    expect(listMicrovmRunners).toHaveBeenNthCalledWith(2, {
      environment: 'unit-test',
      orphan: true,
    });
  });

  it('uses the listed image ARN when marking, unmarking, and terminating runners', async () => {
    vi.mocked(listMicrovmRunners).mockResolvedValue([
      { id: 'mvm-1', imageArn: overrideImageArn, owner: 'Codertocat', type: 'Org', state: 'RUNNING' },
    ]);
    const provider = createMicrovmScaleDownProvider();

    await provider.list('unit-test');
    await provider.markOrphan('mvm-1');
    await provider.unmarkOrphan('mvm-1');
    await provider.terminate('mvm-1');

    expect(tagMicrovm).toHaveBeenCalledWith(overrideImageArn, 'mvm-1', { 'ghr:orphan': 'true' });
    expect(untagMicrovm).toHaveBeenCalledWith(overrideImageArn, 'mvm-1', ['ghr:orphan']);
    expect(terminateMicrovm).toHaveBeenCalledWith('mvm-1');
  });

  it('uses the MicroVM boot-time policy', () => {
    const provider = createMicrovmScaleDownProvider();
    const runner = { id: 'mvm-1', owner: 'Codertocat', type: 'Org' as const };

    expect(provider.bootTimeExceeded(runner)).toBe(false);
    expect(microvmBootTimeExceeded).toHaveBeenCalledWith(runner);
  });
});

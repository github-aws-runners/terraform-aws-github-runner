import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { ScaleDownRunnerProvider } from '../../scale-runners/types';

type TestScaleDownProvider<TType extends string> = Omit<ScaleDownRunnerProvider, 'type'> & { type: TType };

export interface ScaleDownContractLane<TType extends string> {
  provider: TestScaleDownProvider<TType>;
}

interface ScaleDownContractOptions<TType extends string> {
  lanes: readonly ScaleDownContractLane<TType>[];
  resolveCapability: MockInstance<
    (type: TType, capability: 'scaleDown') => () => Omit<TestScaleDownProvider<TType>, 'type'>
  >;
  scaleDown: () => Promise<void>;
}

export function defineScaleDownContractTests<TType extends string>({
  lanes,
  resolveCapability,
  scaleDown,
}: ScaleDownContractOptions<TType>): void {
  describe.each(lanes.map((lane) => [lane.provider.type, lane] as const))(
    '%s scale-down orchestration contract',
    (_, { provider }) => {
      beforeEach(() => {
        process.env.ENVIRONMENT = 'test-environment';
        process.env.RUNNER_PROVIDER_TYPE = provider.type;
        process.env.SCALE_DOWN_CONFIG = '[]';

        resolveCapability.mockReturnValue(() => provider);
        vi.mocked(provider.list).mockResolvedValue([]);
        vi.mocked(provider.bootTimeExceeded).mockReturnValue(false);
        vi.mocked(provider.markOrphan).mockResolvedValue();
        vi.mocked(provider.unmarkOrphan).mockResolvedValue();
        vi.mocked(provider.terminate).mockResolvedValue();
      });

      it('uses the provider to inspect orphan and active runners', async () => {
        await scaleDown();

        expect(resolveCapability).toHaveBeenCalledWith(provider.type, 'scaleDown');
        expect(provider.list).toHaveBeenNthCalledWith(1, 'test-environment', true);
        expect(provider.list).toHaveBeenNthCalledWith(2, 'test-environment');
      });

      it('terminates an orphan that has no GitHub runner identity', async () => {
        vi.mocked(provider.list)
          .mockResolvedValueOnce([{ id: 'orphan-runner', owner: 'owner', type: 'Org', orphan: true }])
          .mockResolvedValue([]);

        await scaleDown();

        expect(provider.terminate).toHaveBeenCalledWith('orphan-runner');
      });

      it('does not terminate an orphan with bypass removal enabled', async () => {
        vi.mocked(provider.list)
          .mockResolvedValueOnce([
            { id: 'protected-runner', owner: 'owner', type: 'Org', orphan: true, bypassRemoval: true },
          ])
          .mockResolvedValue([]);

        await scaleDown();

        expect(provider.terminate).not.toHaveBeenCalled();
      });
    },
  );
}

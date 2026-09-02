import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { PoolEvent } from '../../pool/pool';
import type { PoolComputeProvider } from '../../pool/pool-provider';

type TestPoolProvider<TType extends string> = Omit<PoolComputeProvider, 'type'> & { type: TType };

export interface PoolContractProvider<TType extends string> {
  provider: TestPoolProvider<TType>;
}

interface PoolContractOptions<TType extends string> {
  adjust: (event: PoolEvent) => Promise<void>;
  githubInstallationClient: Octokit;
  computeProviders: readonly PoolContractProvider<TType>[];
  resolveCapability: MockInstance<(type: TType, capability: 'pool') => () => Omit<TestPoolProvider<TType>, 'type'>>;
}

export function definePoolContractTests<TType extends string>({
  adjust,
  computeProviders,
  githubInstallationClient,
  resolveCapability,
}: PoolContractOptions<TType>): void {
  describe.each(computeProviders.map((computeProvider) => [computeProvider.provider.type, computeProvider] as const))(
    '%s pool orchestration contract',
    (_, { provider }) => {
      beforeEach(() => {
        process.env.ENVIRONMENT = 'test-environment';
        process.env.RUNNER_OWNER = 'test-owner';
        process.env.RUNNERS_MAXIMUM_COUNT = '-1';

        resolveCapability.mockReturnValue(() => provider);
        vi.mocked(provider.listRunners).mockResolvedValue([{}, {}]);
        vi.mocked(provider.countAvailableRunners).mockReturnValue(2);
        vi.mocked(provider.createRunners).mockResolvedValue([]);
      });

      it('creates only the runners required to reach the requested pool size', async () => {
        await adjust({ poolSize: 5, type: provider.type });

        expect(resolveCapability).toHaveBeenCalledWith(provider.type, 'pool');
        expect(provider.listRunners).toHaveBeenCalledWith({
          environment: 'test-environment',
          runnerOwner: 'test-owner',
          runnerType: 'Org',
        });
        expect(provider.createRunners).toHaveBeenCalledWith(
          expect.objectContaining({
            githubInstallationClient,
            numberOfRunners: 3,
          }),
        );
      });

      it('does not create runners when the requested pool size is already available', async () => {
        await adjust({ poolSize: 2, type: provider.type });

        expect(provider.createRunners).not.toHaveBeenCalled();
      });

      it('caps pool creation at the remaining maximum-runner headroom', async () => {
        process.env.RUNNERS_MAXIMUM_COUNT = '4';

        await adjust({ poolSize: 5, type: provider.type });

        expect(provider.createRunners).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 2 }));
      });

      it('forwards whether busy runners count toward the pool', async () => {
        process.env.INCLUDE_BUSY_RUNNERS = 'true';

        await adjust({ poolSize: 2, type: provider.type });

        expect(provider.countAvailableRunners).toHaveBeenCalledWith(expect.any(Array), expect.any(Map), true);
      });
    },
  );
}

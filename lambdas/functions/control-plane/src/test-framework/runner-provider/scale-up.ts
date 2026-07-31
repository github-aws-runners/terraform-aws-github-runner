import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import type { ScaleUpRunnerProvider } from '../../scale-runners/scale-up-provider';
import type { ActionRequestMessageSQS } from '../../scale-runners/types';

type TestScaleUpProvider<TType extends string> = Omit<ScaleUpRunnerProvider, 'type'> & { type: TType };

export interface ScaleUpContractLane<TType extends string> {
  provider: TestScaleUpProvider<TType>;
  state: unknown;
}

interface ScaleUpContractOptions<TType extends string> {
  createPayloads: () => ActionRequestMessageSQS[];
  githubInstallationClient: Octokit;
  lanes: readonly ScaleUpContractLane<TType>[];
  resolveCapability: MockInstance<
    (type: TType, capability: 'scaleUp') => () => Omit<TestScaleUpProvider<TType>, 'type'>
  >;
  scaleUp: (payloads: ActionRequestMessageSQS[]) => Promise<string[]>;
}

const createResult = {
  instances: ['runner-1'],
  retryableErrorCount: 0,
  nonRetryableErrorCount: 0,
};

export function defineScaleUpContractTests<TType extends string>({
  createPayloads,
  githubInstallationClient,
  lanes,
  resolveCapability,
  scaleUp,
}: ScaleUpContractOptions<TType>): void {
  describe.each(lanes.map((lane) => [lane.provider.type, lane] as const))(
    '%s scale-up orchestration contract',
    (_, { provider, state }) => {
      beforeEach(() => {
        process.env.ENABLE_ORGANIZATION_RUNNERS = 'true';
        process.env.RUNNERS_MAXIMUM_COUNT = '3';
        process.env.RUNNER_PROVIDER_TYPE = provider.type;

        resolveCapability.mockReturnValue(() => provider);
        vi.mocked(provider.prepareGroup).mockResolvedValue({ runnerLabels: [], state });
        vi.mocked(provider.getCurrentRunners).mockResolvedValue(0);
        vi.mocked(provider.createRunners).mockResolvedValue(createResult);
      });

      it('forwards the prepared lane state through runner lookup and creation', async () => {
        const payloads = createPayloads();
        payloads[0].labels = ['lane-label'];

        await scaleUp(payloads);

        expect(resolveCapability).toHaveBeenCalledWith(provider.type, 'scaleUp');
        expect(provider.prepareGroup).toHaveBeenCalledWith(['lane-label']);
        expect(provider.getCurrentRunners).toHaveBeenCalledWith(state, {
          runnerOwner: payloads[0].repositoryOwner,
          runnerType: 'Org',
        });
        expect(provider.createRunners).toHaveBeenCalledWith(
          expect.objectContaining({
            githubInstallationClient,
            numberOfRunners: 1,
            state,
          }),
        );
      });

      it('does not query current runners when the lane has unlimited capacity', async () => {
        process.env.RUNNERS_MAXIMUM_COUNT = '-1';
        const payloads = createPayloads();
        payloads.push({ ...payloads[0], id: 2, messageId: 'message-2' });

        await scaleUp(payloads);

        expect(provider.getCurrentRunners).not.toHaveBeenCalled();
        expect(provider.createRunners).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 2 }));
      });

      it('does not create runners when the lane has reached maximum capacity', async () => {
        process.env.RUNNERS_MAXIMUM_COUNT = '1';
        vi.mocked(provider.getCurrentRunners).mockResolvedValue(1);

        await scaleUp(createPayloads());

        expect(provider.createRunners).not.toHaveBeenCalled();
      });
    },
  );
}

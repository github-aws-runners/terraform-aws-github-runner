import { describe, expect, it } from 'vitest';

import type { RunnerMatcherConfig, WebhookProviderModule } from '../contracts';
import { defaultComputeProvider } from '../provider-types';
import type { ComputeProviderType } from '../provider-types';
import { selectDynamicLabelQueue } from '../webhook';

interface RejectingPolicyCase {
  name: string;
  apply(queue: RunnerMatcherConfig): void;
}

interface WebhookProviderContractOptions<TProvider extends ComputeProviderType> {
  provider: WebhookProviderModule<TProvider>;
  acceptedDynamicLabels: readonly [string, ...string[]];
  configureQueue?(queue: RunnerMatcherConfig): void;
  rejectingPolicies: readonly [RejectingPolicyCase, ...RejectingPolicyCase[]];
}

export function defineWebhookProviderContractTests<TProvider extends ComputeProviderType>({
  provider,
  acceptedDynamicLabels,
  configureQueue,
  rejectingPolicies,
}: WebhookProviderContractOptions<TProvider>): void {
  const nonGhrLabels = ['self-hosted', 'linux'];
  const dynamicLabels = [...acceptedDynamicLabels];

  function configuredRunnerQueue(id: string, computeProvider?: ComputeProviderType): RunnerMatcherConfig {
    const queue = runnerQueue(id, computeProvider);
    configureQueue?.(queue);
    return queue;
  }

  function expectProviderSelected(queue: RunnerMatcherConfig) {
    expect(selectDynamicLabelQueue([queue], nonGhrLabels, dynamicLabels)).toEqual({
      queue,
      labels: [...nonGhrLabels, ...dynamicLabels],
    });
  }

  describe(`${provider.type} webhook provider contract`, () => {
    it('selects an explicitly configured provider through the production registry', () => {
      expectProviderSelected(configuredRunnerQueue(`${provider.type}-configured`, provider.type));
    });

    it('skips the provider when dynamic labels are disabled', () => {
      const queue = configuredRunnerQueue(`${provider.type}-disabled`, provider.type);
      queue.matcherConfig.enableDynamicLabels = false;

      expect(selectDynamicLabelQueue([queue], nonGhrLabels, dynamicLabels)).toBeUndefined();
    });

    for (const policy of rejectingPolicies) {
      it(`skips the provider when its ${policy.name} policy rejects the labels`, () => {
        const queue = configuredRunnerQueue(`${provider.type}-policy-rejected`, provider.type);
        policy.apply(queue);

        expect(selectDynamicLabelQueue([queue], nonGhrLabels, dynamicLabels)).toBeUndefined();
      });
    }

    it('normalizes provider configuration before registry selection', () => {
      const queue = configuredRunnerQueue(`${provider.type}-normalized`);
      (queue as unknown as { computeProvider: string }).computeProvider = ` ${provider.type.toUpperCase()} `;

      expectProviderSelected(queue);
    });

    if (provider.type === defaultComputeProvider) {
      it('selects the default provider when the queue omits provider configuration', () => {
        expectProviderSelected(configuredRunnerQueue(`${provider.type}-default`));
      });
    }
  });
}

function runnerQueue(id: string, computeProvider?: ComputeProviderType): RunnerMatcherConfig {
  return {
    id,
    arn: `arn:${id}`,
    computeProvider,
    matcherConfig: {
      labelMatchers: [['self-hosted', 'linux']],
      exactMatch: true,
      enableDynamicLabels: true,
    },
  };
}

import { defineWebhookProviderContractTests } from '../../test/webhook-provider-contract';
import { provider } from './webhook';

defineWebhookProviderContractTests({
  provider,
  acceptedDynamicLabels: ['ghr-microvm-image-version:3.0'],
  configureQueue: (queue) => {
    queue.matcherConfig.awsDynamicLabelsPolicy = {
      restricted_keys: {
        'image-version': { allowed: ['3.0'] },
      },
    };
  },
  rejectingPolicies: [
    {
      name: 'blocked keys',
      apply: (queue) => {
        queue.matcherConfig.awsDynamicLabelsPolicy = {
          blocked_keys: ['image-version'],
        };
      },
    },
    {
      name: 'restricted keys',
      apply: (queue) => {
        queue.matcherConfig.awsDynamicLabelsPolicy = {
          restricted_keys: {
            'image-version': { allowed: ['2.*'] },
          },
        };
      },
    },
  ],
});

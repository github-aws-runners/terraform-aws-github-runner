import { defineWebhookProviderContractTests } from '../../test/webhook-provider-contract';
import { provider } from './webhook';

defineWebhookProviderContractTests({
  provider,
  acceptedDynamicLabels: ['ghr-microvm-maximum-duration-in-seconds:3600'],
  rejectingPolicies: [
    {
      name: 'blocked keys',
      apply: (queue) => {
        queue.matcherConfig.awsDynamicLabelsPolicy = {
          blocked_keys: ['maximum-duration-in-seconds'],
        };
      },
    },
    {
      name: 'restricted keys',
      apply: (queue) => {
        queue.matcherConfig.awsDynamicLabelsPolicy = {
          restricted_keys: {
            'maximum-duration-in-seconds': { max: 1800 },
          },
        };
      },
    },
  ],
});

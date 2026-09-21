import { defineWebhookProviderContractTests } from '../../test/webhook-provider-contract';
import { provider } from './webhook';

defineWebhookProviderContractTests({
  provider,
  acceptedDynamicLabels: ['ghr-ec2-instance-type:t3.large'],
  rejectingPolicies: [
    {
      name: 'blocked keys',
      apply: (queue) => {
        queue.matcherConfig.awsDynamicLabelsPolicy = {
          blocked_keys: ['instance-type'],
        };
      },
    },
    {
      name: 'restricted keys',
      apply: (queue) => {
        queue.matcherConfig.awsDynamicLabelsPolicy = {
          restricted_keys: {
            'instance-type': { allowed: ['m5.*'] },
          },
        };
      },
    },
  ],
});

import { defineWebhookProviderContractTests } from '../../test/webhook-provider-contract';
import { provider } from './webhook';

defineWebhookProviderContractTests({
  provider,
  acceptedDynamicLabels: ['ghr-ec2-instance-type:t3.large'],
});

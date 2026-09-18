import type { ComputeProviderPlugin } from '../../core';
import { computeProvider } from '../../provider-types';

import type { WebhookProviderCapabilities, WebhookProviderModule } from '../../contracts';
import { ec2DynamicLabelProvider } from './src/webhook/dynamic-labels';

export function createEc2WebhookPlugin(): ComputeProviderPlugin<
  WebhookProviderCapabilities,
  typeof computeProvider.ec2
> {
  return {
    type: computeProvider.ec2,
    capabilities: { dynamicLabels: ec2DynamicLabelProvider },
  };
}

export const provider = {
  type: computeProvider.ec2,
  createPlugin: createEc2WebhookPlugin,
} satisfies WebhookProviderModule<typeof computeProvider.ec2>;

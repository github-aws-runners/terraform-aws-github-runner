import type { ComputeProviderPlugin } from '../../core';

import type { WebhookProviderCapabilities, WebhookProviderModule } from '../../contracts';
import { ec2DynamicLabelProvider } from './src/webhook/dynamic-labels';

export function createEc2WebhookPlugin(): ComputeProviderPlugin<WebhookProviderCapabilities, 'ec2'> {
  return {
    type: 'ec2',
    capabilities: { dynamicLabels: ec2DynamicLabelProvider },
  };
}

export const provider = {
  type: 'ec2',
  createPlugin: createEc2WebhookPlugin,
} satisfies WebhookProviderModule<'ec2'>;

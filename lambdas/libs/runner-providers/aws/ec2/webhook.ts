import type { RunnerProviderPlugin } from '../../core';

import type { WebhookProviderCapabilities } from '../../contracts';
import { ec2DynamicLabelProvider } from './src/webhook/dynamic-labels';

export function createEc2WebhookPlugin(): RunnerProviderPlugin<WebhookProviderCapabilities, 'ec2'> {
  return {
    type: 'ec2',
    capabilities: { dynamicLabels: ec2DynamicLabelProvider },
  };
}

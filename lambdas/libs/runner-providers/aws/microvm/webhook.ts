import type { RunnerProviderPlugin } from '../../core';

import type { WebhookProviderCapabilities, WebhookProviderModule } from '../../contracts';
import { microvmDynamicLabelProvider } from './src/webhook/dynamic-labels';

export function createMicrovmWebhookPlugin(): RunnerProviderPlugin<WebhookProviderCapabilities, 'microvm'> {
  return {
    type: 'microvm',
    capabilities: { dynamicLabels: microvmDynamicLabelProvider },
  };
}

export const provider = {
  type: 'microvm',
  createPlugin: createMicrovmWebhookPlugin,
} satisfies WebhookProviderModule<'microvm'>;

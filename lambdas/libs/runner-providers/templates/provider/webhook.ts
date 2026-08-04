import type { RunnerProviderPlugin } from '../../core';

import type { DynamicLabelProvider, WebhookProviderCapabilities, WebhookProviderModule } from '../../contracts';

export const templateDynamicLabelProvider: DynamicLabelProvider = {
  selectQueue: (input) => {
    void input;
    // Return a dispatch target when this provider accepts the requested dynamic labels.
    return undefined;
  },
};

export function createTemplateWebhookPlugin(): RunnerProviderPlugin<WebhookProviderCapabilities, 'template'> {
  return {
    type: 'template',
    capabilities: { dynamicLabels: templateDynamicLabelProvider },
  };
}

export const provider = {
  type: 'template',
  createPlugin: createTemplateWebhookPlugin,
} satisfies WebhookProviderModule<'template'>;

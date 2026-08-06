import type { RunnerProviderPlugin } from '../../core';

import type { DynamicLabelProvider, WebhookProviderCapabilities, WebhookProviderModule } from '../../contracts';

export const templateDynamicLabelProvider: DynamicLabelProvider = {
  getViolations: (input) => {
    void input;
    // Return violations for dynamic labels this provider does not accept.
    return [];
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

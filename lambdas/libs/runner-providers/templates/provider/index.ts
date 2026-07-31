import type { RunnerProviderModule } from '../../contracts';

import { createTemplateControlPlanePlugin } from './control-plane';
import { createTemplateWebhookPlugin } from './webhook';

/**
 * Copy this module for a new provider and register the completed module once in
 * providers.config.ts. Do not register this template itself.
 */
export const templateProvider = {
  type: 'template',
  createControlPlanePlugin: createTemplateControlPlanePlugin,
  createWebhookPlugin: createTemplateWebhookPlugin,
} satisfies RunnerProviderModule<'template'>;

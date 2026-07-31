import type { RunnerProviderModule } from '../../contracts';

import { createEc2ControlPlanePlugin } from './control-plane';
import { createEc2WebhookPlugin } from './webhook';

export const ec2Provider = {
  type: 'ec2',
  createControlPlanePlugin: createEc2ControlPlanePlugin,
  createWebhookPlugin: createEc2WebhookPlugin,
} satisfies RunnerProviderModule;

export { createEc2ControlPlanePlugin, createEc2WebhookPlugin };

export * from './src/control-plane/dynamic-labels';
export * from './src/control-plane/pool';
export * from './src/control-plane/runner-config';
export * from './src/control-plane/runners';
export type * from './src/control-plane/runners.d';
export * from './src/control-plane/scale-down';
export * from './src/control-plane/scale-up';
export * from './src/webhook/dynamic-labels';
export * from './src/webhook/dynamic-labels-policy';
export type * from './src/webhook/types';

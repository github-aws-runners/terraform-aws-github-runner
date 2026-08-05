import { expect, it, vi } from 'vitest';

import { createControlPlaneProviderRegistry } from './control-plane';
import { runnerProviderTypes } from './provider-types';
import { enabledControlPlaneProviders } from './providers.config.control-plane';
import { enabledWebhookProviders } from './providers.config.webhook';
import { webhookProviderRegistry } from './webhook';

it('exposes every configured provider through both capability registries', () => {
  const createStartRunnerConfig = vi.fn(async () => []);
  const controlPlaneRegistry = createControlPlaneProviderRegistry(createStartRunnerConfig);
  const controlPlaneTypes = enabledControlPlaneProviders.map(({ type }) => type);
  const webhookTypes = enabledWebhookProviders.map(({ type }) => type);

  expect(controlPlaneTypes).toEqual(runnerProviderTypes);
  expect(webhookTypes).toEqual(runnerProviderTypes);

  for (const type of runnerProviderTypes) {
    expect(controlPlaneRegistry.capability(type, 'pool')()).toEqual({
      listRunners: expect.any(Function),
      countAvailableRunners: expect.any(Function),
      createRunners: expect.any(Function),
    });
    expect(controlPlaneRegistry.capability(type, 'scaleUp')()).toEqual({
      resolveLabelsForRunners: expect.any(Function),
      getCurrentRunners: expect.any(Function),
      createRunners: expect.any(Function),
    });
    expect(controlPlaneRegistry.capability(type, 'scaleDown')()).toEqual({
      list: expect.any(Function),
      bootTimeExceeded: expect.any(Function),
      markOrphan: expect.any(Function),
      unmarkOrphan: expect.any(Function),
      terminate: expect.any(Function),
    });
    expect(webhookProviderRegistry.capability(type, 'dynamicLabels').selectQueue).toEqual(expect.any(Function));
  }
});

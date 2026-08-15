import { expect, it, vi } from 'vitest';

import { createControlPlaneProviderRegistry } from './control-plane';
import { computeProviderTypes } from './provider-types';
import { enabledControlPlaneProviders } from './providers.config.control-plane';
import { enabledScaleSetProviders } from './providers.config.scale-set';
import { enabledWebhookProviders } from './providers.config.webhook';
import { createScaleSetProviderRegistry } from './scale-set';
import { webhookProviderRegistry } from './webhook';

it('exposes every configured provider through its dedicated capability registry', () => {
  const createStartRunnerConfig = vi.fn(async () => []);
  const controlPlaneRegistry = createControlPlaneProviderRegistry(createStartRunnerConfig);
  const scaleSetRegistry = createScaleSetProviderRegistry();
  const controlPlaneTypes = enabledControlPlaneProviders.map(({ type }) => type);
  const scaleSetTypes = enabledScaleSetProviders.map(({ type }) => type);
  const webhookTypes = enabledWebhookProviders.map(({ type }) => type);

  expect(controlPlaneTypes).toEqual(computeProviderTypes);
  expect(scaleSetTypes).toEqual(['ec2']);
  expect(webhookTypes).toEqual(computeProviderTypes);

  for (const type of computeProviderTypes) {
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
    expect(controlPlaneRegistry.get(type).capabilities).not.toHaveProperty('scaleSet');
    expect(webhookProviderRegistry.capability(type, 'dynamicLabels').getViolations).toEqual(expect.any(Function));
  }

  for (const type of scaleSetTypes) {
    expect(scaleSetRegistry.capability(type, 'scaleSet')()).toEqual({
      getCurrentRunners: expect.any(Function),
      createRunners: expect.any(Function),
      terminateSurplusRunners: expect.any(Function),
      markRunnerStarted: expect.any(Function),
      terminateCompletedRunner: expect.any(Function),
    });
  }
});

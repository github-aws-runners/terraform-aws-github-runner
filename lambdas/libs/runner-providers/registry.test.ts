import { expect, it, vi } from 'vitest';

import { createControlPlaneProviderRegistry } from './control-plane';
import { enabledRunnerProviderTypes } from './providers.config';
import { webhookProviderRegistry } from './webhook';

it('enables every configured provider in both runtime registries', () => {
  const createStartRunnerConfig = vi.fn(async () => []);
  const controlPlaneRegistry = createControlPlaneProviderRegistry(createStartRunnerConfig);
  const enabledTypes = enabledRunnerProviderTypes;

  expect(controlPlaneRegistry.types).toEqual(enabledTypes);
  expect(webhookProviderRegistry.types).toEqual(enabledTypes);

  for (const type of enabledTypes) {
    expect(controlPlaneRegistry.capability(type, 'pool')).toEqual(expect.any(Function));
    expect(controlPlaneRegistry.capability(type, 'scaleUp')).toEqual(expect.any(Function));
    expect(controlPlaneRegistry.capability(type, 'scaleDown')).toEqual(expect.any(Function));
    expect(webhookProviderRegistry.capability(type, 'dynamicLabels').selectQueue).toEqual(expect.any(Function));
  }
});

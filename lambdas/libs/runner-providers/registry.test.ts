import { expect, it, vi } from 'vitest';

import { enabledRunnerProviderTypes } from './providers.config';
import { providerRegistry } from './registry';

it('enables every configured provider in both runtime registries', () => {
  const createStartRunnerConfig = vi.fn(async () => []);
  const controlPlaneRegistry = providerRegistry.controlPlane(createStartRunnerConfig);
  const enabledTypes = enabledRunnerProviderTypes;

  expect(providerRegistry.types).toEqual(enabledTypes);
  expect(controlPlaneRegistry.types).toEqual(enabledTypes);
  expect(providerRegistry.webhook.types).toEqual(enabledTypes);

  for (const type of enabledTypes) {
    expect(controlPlaneRegistry.capability(type, 'pool')).toEqual(expect.any(Function));
    expect(controlPlaneRegistry.capability(type, 'scaleUp')).toEqual(expect.any(Function));
    expect(controlPlaneRegistry.capability(type, 'scaleDown')).toEqual(expect.any(Function));
    expect(providerRegistry.webhook.capability(type, 'dynamicLabels').selectQueue).toEqual(expect.any(Function));
  }
});

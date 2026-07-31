import { expect, it, vi } from 'vitest';

import { enabledRunnerProviders } from './providers.config';
import { providerRegistry } from './registry';

it('exposes every configured provider through both capability registries', () => {
  const createStartRunnerConfig = vi.fn(async () => []);
  const controlPlaneRegistry = providerRegistry.controlPlane(createStartRunnerConfig);
  const enabledTypes = enabledRunnerProviders.map(({ type }) => type);

  expect(providerRegistry.types).toEqual(enabledTypes);

  for (const type of enabledTypes) {
    expect(controlPlaneRegistry.capability(type, 'pool')).toEqual(expect.any(Function));
    expect(controlPlaneRegistry.capability(type, 'scaleUp')).toEqual(expect.any(Function));
    expect(controlPlaneRegistry.capability(type, 'scaleDown')).toEqual(expect.any(Function));
    expect(providerRegistry.webhook.capability(type, 'dynamicLabels').selectQueue).toEqual(expect.any(Function));
  }
});

import { createComputeProviderRegistry } from './core';

import type { ScaleSetProviderCapabilities } from './contracts';
import { enabledScaleSetProviders } from './providers.config.scale-set';

export function createScaleSetProviderRegistry() {
  return createComputeProviderRegistry<ScaleSetProviderCapabilities>(
    enabledScaleSetProviders.map((provider) => provider.createPlugin()),
  );
}

export const scaleSetProviderRegistry = createScaleSetProviderRegistry();

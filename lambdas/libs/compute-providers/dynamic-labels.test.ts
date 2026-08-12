import { expect, it } from 'vitest';

import { dynamicLabelsForOtherProvider } from './dynamic-labels';
import { computeProviderTypes } from './provider-types';

it.each(computeProviderTypes)('returns labels belonging to providers other than %s', (provider) => {
  const providerLabels = computeProviderTypes.map((type) => `ghr-${type}-size:large`);

  expect(dynamicLabelsForOtherProvider(providerLabels, provider)).toEqual(
    providerLabels.filter((label) => !label.startsWith(`ghr-${provider}-`)),
  );
});

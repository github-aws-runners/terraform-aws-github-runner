import { expect, it } from 'vitest';

import { dynamicLabelsForOtherProvider } from './dynamic-labels';

const providerTypes = ['alpha', 'beta'] as const;

it.each(providerTypes)('returns labels belonging to providers other than %s', (provider) => {
  const providerLabels = providerTypes.map((type) => `ghr-${type}-size:large`);

  expect(dynamicLabelsForOtherProvider(providerLabels, provider, providerTypes)).toEqual(
    providerLabels.filter((label) => !label.startsWith(`ghr-${provider}-`)),
  );
});

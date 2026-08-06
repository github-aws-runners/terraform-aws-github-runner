import { expect, it } from 'vitest';

import { dynamicLabelsForOtherProvider } from './dynamic-labels';
import { runnerProviderTypes } from './provider-types';

it.each(runnerProviderTypes)('returns labels belonging to providers other than %s', (provider) => {
  const providerLabels = runnerProviderTypes.map((type) => `ghr-${type}-size:large`);

  expect(dynamicLabelsForOtherProvider(providerLabels, provider)).toEqual(
    providerLabels.filter((label) => !label.startsWith(`ghr-${provider}-`)),
  );
});

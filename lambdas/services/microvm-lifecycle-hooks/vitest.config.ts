import { mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.base.config';

export default mergeConfig(defaultConfig, {
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});

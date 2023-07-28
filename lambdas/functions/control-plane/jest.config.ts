import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 97.6,
      branches: 94.6,
      functions: 97,
      lines: 98,
    },
  },
};

export default config;

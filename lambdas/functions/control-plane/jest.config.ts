import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 98.01,
      branches: 97.28,
      functions: 95.6,
      lines: 97.94,
    },
  },
};

export default config;

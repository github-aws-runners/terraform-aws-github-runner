import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 97.99,
      branches: 97.26,
      functions: 95.45,
      lines: 97.92,
    },
  },
};

export default config;

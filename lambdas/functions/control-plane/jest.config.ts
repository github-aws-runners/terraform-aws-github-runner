import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 97.99,
      branches: 96.04,
      functions: 97.53,
      lines: 98.3,
    },
  },
};

export default config;

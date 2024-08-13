import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 97.01,
      branches: 96.11,
      lines: 96.92,
      functions: 93.81,
    },
  },
};

export default config;

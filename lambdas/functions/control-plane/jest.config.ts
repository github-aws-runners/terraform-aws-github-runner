import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 97.89,
      branches: 94.64,
      functions: 97.33,
      lines: 98.21,
    },
  },
};

export default config;

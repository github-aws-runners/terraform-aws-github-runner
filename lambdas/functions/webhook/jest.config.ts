import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 99.07,
      branches: 93.33,
      functions: 100,
      lines: 99.02,
    },
  },
};

export default config;

import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 99.13,
      branches: 96.87,
      functions: 100,
      lines: 99.09,
    },
  },
};

export default config;

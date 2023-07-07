import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 97,
      branches: 93,
      functions: 96,
      lines: 98,
    },
  },
};

export default config;

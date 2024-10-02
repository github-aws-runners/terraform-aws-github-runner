import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 99.2,
      branches: 100,
      functions: 100,
      lines: 99.25,
    },
  },
};

export default config;

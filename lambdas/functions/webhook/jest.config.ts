import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 99.58,
      branches: 100,
      functions: 100,
      lines: 99.57,
    },
  },
};

export default config;

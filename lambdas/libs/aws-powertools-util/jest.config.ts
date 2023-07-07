import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 99,
      branches: 86,
      functions: 100,
      lines: 99,
    },
  },
};

export default config;

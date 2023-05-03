import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 98,
      branches: 85,
      functions: 90,
      lines: 98,
    },
  },
};

export default config;

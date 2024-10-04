import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 97.86,
      branches: 96.68,
      functions: 95.95,
      lines: 97.8,
    },
  },
};

export default config;

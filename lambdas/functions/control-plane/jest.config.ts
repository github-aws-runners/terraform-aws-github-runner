import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 97.78,
      branches: 96.61,
      functions: 95.84,
      lines: 97.71,
    },
  },
};

export default config;

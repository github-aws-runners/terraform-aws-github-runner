import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 97.79,
      branches: 96.13,
      functions: 95.4,
      lines: 98.06,
    },
  },
};

export default config;

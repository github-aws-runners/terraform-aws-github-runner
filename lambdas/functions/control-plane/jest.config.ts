import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 97.75,
      branches: 96.6,
      functions: 95.83,
      lines: 97.68,
    },
  },
};

export default config;

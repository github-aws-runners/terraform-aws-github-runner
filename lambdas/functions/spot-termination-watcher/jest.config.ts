import type { Config } from 'jest';

import defaultConfig from '../../jest.base.config';

const config: Config = {
  ...defaultConfig,
  coverageThreshold: {
    global: {
      statements: 95.91,
      branches: 95.65,
      functions: 100,
      lines: 95.83,
    },
  },
};

export default config;

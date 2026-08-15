import { resolve } from 'path';

import { mergeConfig } from 'vitest/config';
import defaultConfig from '../../vitest.base.config';

export default mergeConfig(defaultConfig, {
  test: {
    setupFiles: [resolve(__dirname, '../../aws-vitest-setup.ts')],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/test/**/*',
        'src/**/*.d.ts',
        // Thin executable/container entrypoints are exercised through their exported lifecycle implementation.
        'src/scale-set/ecs-listener-main.ts',
        'src/scale-set/index.ts',
      ],
      thresholds: {
        statements: 96.64,
        branches: 96.43,
        functions: 94.52,
        lines: 96.64,
      },
    },
  },
});

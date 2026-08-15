import { mergeConfig } from 'vitest/config';

import defaultConfig from '../../vitest.base.config';

export default mergeConfig(defaultConfig, {
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/index.ts'],
      thresholds: {
        // Measured by the package-scoped wire-contract suite. These floors keep
        // meaningful regression protection without pretending every defensive
        // parser/error branch is exercised by production-path tests.
        statements: 75,
        branches: 60,
        functions: 80,
        lines: 75,
      },
    },
  },
});

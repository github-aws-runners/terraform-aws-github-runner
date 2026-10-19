import { mergeConfig } from 'vitest/config';
import defaultConfig from '../../vitest.base.config';

export default mergeConfig(defaultConfig, {
  root: __dirname,
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/main.ts'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});

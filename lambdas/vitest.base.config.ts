import type { ViteUserConfig } from 'vitest/config';

const defaultConfig: ViteUserConfig = {
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['**/src/**/*.ts'],
      exclude: ['**/*local*.ts', '**/*.d.ts', '**/*.test.ts', '**/node_modules/**'],
      reportsDirectory: './coverage',
    },
    globals: true,
    watch: false,
  },
};

export default defaultConfig;

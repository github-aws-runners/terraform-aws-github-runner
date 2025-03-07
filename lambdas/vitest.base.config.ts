import { defineConfig } from 'vitest/config';

const defaultConfig = defineConfig({
  test: {
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['**/src/**/*.ts'],
      exclude: ['**/*local*.ts', '**/*.d.ts', '**/*.test.ts', '**/node_modules/**'],
      all: true,
      reportsDirectory: './coverage'
    },
    globals: true,
    watch: false
  }
});

export default defaultConfig;

import { resolve } from 'path';

import { mergeConfig } from 'vitest/config';
import defaultConfig from '../../vitest.base.config';

export default mergeConfig(defaultConfig, {
  test: {
    setupFiles: [resolve(__dirname, '../../aws-vitest-setup.ts')],
    coverage: {
      include: [
        'contracts.ts',
        'provider-types.ts',
        'providers.config.*.ts',
        'control-plane.ts',
        'webhook.ts',
        'core/**/*.ts',
        'aws/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'templates/**/*'],
      thresholds: {
        statements: 96.16,
        branches: 95.32,
        functions: 93.06,
        lines: 96.53,
      },
    },
  },
});

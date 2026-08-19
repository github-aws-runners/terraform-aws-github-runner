import { resolve } from 'path';

import { mergeConfig } from 'vitest/config';
import defaultConfig from '../../vitest.base.config';

export default mergeConfig(defaultConfig, {
  test: {
    setupFiles: [resolve(__dirname, '../../aws-vitest-setup.ts')],
    coverage: {
      include: [
        'index.ts',
        'provider.ts',
        'github-app-credentials.ts',
        'runner-config.ts',
        'runner-group-cache.ts',
        'core/**/*.ts',
        'aws/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
});

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
        'github-webhook-secret.ts',
        'runner-config-consumer.ts',
        'runner-config-consumer-common.ts',
        'runner-config.ts',
        'runner-group-cache.ts',
        'runner-matcher-config.ts',
        'runner-state.ts',
        'core/**/*.ts',
        'aws/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
});

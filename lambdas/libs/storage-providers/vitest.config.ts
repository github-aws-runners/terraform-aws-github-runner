import { resolve } from 'path';

import { mergeConfig } from 'vitest/config';
import defaultConfig from '../../vitest.base.config';

export default mergeConfig(defaultConfig, {
  test: {
    setupFiles: [resolve(__dirname, '../../aws-vitest-setup.ts')],
    coverage: {
      include: [
        'index.ts',
        'runner-config-housekeeper.ts',
        'runner-config-consumer.ts',
        'storage-providers.ts',
        'provider.ts',
        'core/**/*.ts',
        'aws/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.d.ts'],
    },
  },
});

import { resolve } from 'path';

import { mergeConfig } from 'vitest/config';
import defaultConfig from '../../vitest.base.config';

export default mergeConfig(defaultConfig, {
  test: {
    globals: true,
    setupFiles: [resolve(__dirname, '../../aws-vitest-setup.ts')],
  },
});

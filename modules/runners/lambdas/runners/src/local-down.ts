import { config } from 'aws-sdk';

import { configureProxyAwsSdkV2Only } from './lambda';
import { logger } from './logger';
import { scaleDown } from './scale-runners/scale-down';

export function run(): void {
  configureProxyAwsSdkV2Only(config);
  scaleDown()
    .then()
    .catch((e) => {
      logger.error(e);
    });
}

run();

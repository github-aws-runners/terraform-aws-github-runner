import { config } from 'aws-sdk';

import { configureProxyAwsSdkV2Only } from './lambda';
import { logger } from './logger';
import { adjust } from './pool/pool';

export function run(): void {
  configureProxyAwsSdkV2Only(config);
  adjust({ poolSize: 1 })
    .then()
    .catch((e) => {
      logger.error(e);
    });
}

run();

import { logger } from '@terraform-aws-github-runner/powertools-utils';

import { sync } from './syncer/syncer';

sync()
  .then()
  .catch((e) => {
    if (e instanceof Error) {
      logger.error(e.message);
    }
    logger.debug('Ignoring error', { error: e });
  });

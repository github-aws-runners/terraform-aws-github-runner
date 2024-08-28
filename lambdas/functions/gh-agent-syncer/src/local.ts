import { logger } from '@aws-github-runner/aws-powertools-util';

import { sync } from './syncer/syncer';

sync()
  .then()
  .catch((e) => {
    if (e instanceof Error) {
      logger.error(e.message);
    }
    logger.debug('Ignoring error', { error: e });
  });

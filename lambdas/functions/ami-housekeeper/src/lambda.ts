import { logger, setContext } from '@terraform-aws-github-runner/aws-powertools-util';
import { Context } from 'aws-lambda';
import 'source-map-support/register';

import { amiCleanup } from './ami';

export async function handler(event: unknown, context: Context): Promise<void> {
  setContext(context, 'lambda.ts');
  logger.logEventIfEnabled(event);

  try {
    const config = JSON.parse(process.env.AMI_CLEANUP_OPTIONS);
    logger.debug('Clean-up options', { config });
    await amiCleanup(config);
  } catch (e) {
    logger.error(`${(e as Error).message}`, { error: e as Error });
  }
}

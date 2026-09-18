import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import { computeProvider } from '../../provider-types';

export function createEc2ComputeProviderLogger(module: string) {
  const logger = createChildLogger(module);
  logger.appendPersistentKeys({
    computeProvider: computeProvider.ec2,
  });
  return logger;
}

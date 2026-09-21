import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import { runnerConfigStorageProvider } from '../../provider';

export function createAwsSsmStorageLogger(module: string) {
  const logger = createChildLogger(module);
  logger.appendPersistentKeys({
    storageProvider: runnerConfigStorageProvider.awsSsm,
  });
  return logger;
}

export function getErrorNames(error: unknown): string[] {
  const names: string[] = [];
  const seen = new Set<object>();
  let current: unknown = error;

  while (current !== null && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    if ('name' in current && typeof current.name === 'string') {
      names.push(current.name);
    }
    current = 'cause' in current ? current.cause : undefined;
  }

  return names;
}

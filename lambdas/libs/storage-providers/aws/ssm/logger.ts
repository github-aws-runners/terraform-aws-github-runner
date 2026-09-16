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
    // Some AWS error responses carry the exception type as `__type` (e.g.
    // "com.amazonaws.ssm#ParameterNotFound") instead of `.name`.
    if ('__type' in current && typeof current.__type === 'string') {
      names.push(current.__type.split('#').pop() as string);
    }
    current = 'cause' in current ? current.cause : undefined;
  }

  return names;
}

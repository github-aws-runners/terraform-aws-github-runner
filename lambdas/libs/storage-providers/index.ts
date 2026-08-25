import { awsSsmStorageProvider } from './aws/ssm';
import {
  createStorageProviderRegistry,
  type RunnerBootstrapStoreContext,
  type RunnerGroupCacheStoreContext,
} from './core';
import { resolveStorageProviderType } from './provider-types';

export type * from './core';
export type * from './provider-types';

export const storageProviderRegistry = createStorageProviderRegistry([awsSsmStorageProvider]);

export function createRunnerBootstrapStoreFromEnvironment(context: RunnerBootstrapStoreContext) {
  const provider = resolveStorageProviderType(process.env.RUNNER_BOOTSTRAP_STORAGE_PROVIDER_TYPE);
  return storageProviderRegistry.createRunnerBootstrapStore(provider, context);
}

export function createRunnerGroupCacheStoreFromEnvironment(context: RunnerGroupCacheStoreContext) {
  const provider = resolveStorageProviderType(process.env.RUNNER_GROUP_CACHE_STORAGE_PROVIDER_TYPE);
  return storageProviderRegistry.createRunnerGroupCacheStore(provider, context);
}

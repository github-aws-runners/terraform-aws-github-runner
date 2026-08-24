import type { StorageProviderType } from '../provider-types';

export interface StorageMetadataTag {
  key: string;
  value: string;
}

export interface RunnerBootstrapIdentity {
  kind: 'runner_bootstrap';
  runnerId: string;
}

export interface RunnerBootstrapRecord {
  identity: RunnerBootstrapIdentity;
  payload: string;
}

export interface RunnerBootstrapWriteOptions {
  metadataTags?: StorageMetadataTag[];
}

/**
 * Short-lived, sensitive handoff from orchestration to one runner.
 *
 * Reading and deletion happen in the runner bootstrap implementation. This
 * writer deliberately exposes no generic key/value operations.
 */
export interface RunnerBootstrapStore {
  readonly provider: StorageProviderType;
  readonly maxWritesPerSecond?: number;
  put(record: RunnerBootstrapRecord, options?: RunnerBootstrapWriteOptions): Promise<void>;
}

export interface RunnerGroupCacheIdentity {
  kind: 'runner_group_cache';
  groupName: string;
}

export interface RunnerGroupCacheRecord {
  identity: RunnerGroupCacheIdentity;
  payload: string;
}

/** Rebuildable cache for GitHub runner-group IDs. */
export interface RunnerGroupCacheStore {
  readonly provider: StorageProviderType;
  get(identity: RunnerGroupCacheIdentity): Promise<RunnerGroupCacheRecord | undefined>;
  put(record: RunnerGroupCacheRecord): Promise<void>;
}

export interface RunnerBootstrapStoreContext {
  locator: string;
  metadataTags: StorageMetadataTag[];
}

export interface RunnerGroupCacheStoreContext {
  locator: string;
  metadataTags: StorageMetadataTag[];
}

export interface StorageProvider {
  readonly type: StorageProviderType;
  createRunnerBootstrapStore(context: RunnerBootstrapStoreContext): RunnerBootstrapStore;
  createRunnerGroupCacheStore(context: RunnerGroupCacheStoreContext): RunnerGroupCacheStore;
}

export function createStorageProviderRegistry(providers: readonly StorageProvider[]) {
  const providersByType = new Map(providers.map((provider) => [provider.type, provider]));

  function get(type: StorageProviderType): StorageProvider {
    const provider = providersByType.get(type);
    if (!provider) {
      throw new Error(`No storage provider registered for '${type}'`);
    }
    return provider;
  }

  return {
    get,
    createRunnerBootstrapStore: (type: StorageProviderType, context: RunnerBootstrapStoreContext) =>
      get(type).createRunnerBootstrapStore(context),
    createRunnerGroupCacheStore: (type: StorageProviderType, context: RunnerGroupCacheStoreContext) =>
      get(type).createRunnerGroupCacheStore(context),
  };
}

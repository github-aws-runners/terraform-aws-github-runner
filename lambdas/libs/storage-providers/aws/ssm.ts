import { getParameter, putParameter } from '@aws-github-runner/aws-ssm-util';

import type {
  RunnerBootstrapRecord,
  RunnerBootstrapStore,
  RunnerBootstrapStoreContext,
  RunnerBootstrapWriteOptions,
  RunnerGroupCacheIdentity,
  RunnerGroupCacheRecord,
  RunnerGroupCacheStore,
  RunnerGroupCacheStoreContext,
  StorageMetadataTag,
  StorageProvider,
} from '../core';

export const awsSsmStorageProvider: StorageProvider = {
  type: 'aws_ssm',
  createRunnerBootstrapStore: (context) => new AwsSsmRunnerBootstrapStore(context),
  createRunnerGroupCacheStore: (context) => new AwsSsmRunnerGroupCacheStore(context),
};

function toSsmTags(tags: StorageMetadataTag[]) {
  return tags.map(({ key, value }) => ({ Key: key, Value: value }));
}

class AwsSsmRunnerBootstrapStore implements RunnerBootstrapStore {
  readonly provider = 'aws_ssm';
  readonly maxWritesPerSecond = 40;

  constructor(private readonly context: RunnerBootstrapStoreContext) {}

  async put(record: RunnerBootstrapRecord, options: RunnerBootstrapWriteOptions = {}): Promise<void> {
    await putParameter(`${this.context.locator}/${record.identity.runnerId}`, record.payload, true, {
      tags: toSsmTags([...(options.metadataTags ?? []), ...this.context.metadataTags]),
    });
  }
}

class AwsSsmRunnerGroupCacheStore implements RunnerGroupCacheStore {
  readonly provider = 'aws_ssm';

  constructor(private readonly context: RunnerGroupCacheStoreContext) {}

  async get(identity: RunnerGroupCacheIdentity): Promise<RunnerGroupCacheRecord | undefined> {
    const payload = await getParameter(`${this.context.locator}/runner-group/${identity.groupName}`);
    return payload === undefined ? undefined : { identity, payload };
  }

  async put(record: RunnerGroupCacheRecord): Promise<void> {
    await putParameter(`${this.context.locator}/runner-group/${record.identity.groupName}`, record.payload, false, {
      tags: toSsmTags(this.context.metadataTags),
    });
  }
}

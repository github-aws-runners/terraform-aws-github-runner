import {
  createRunnerConfigConsumerFromEnvironment,
  exportRunnerConfigStorageEnvironment,
  type RunnerConfigConsumer,
  type RunnerConfigStorageContext,
} from '@aws-github-runner/storage-providers/runner-config-consumer';

import type { ConsumeOptions, JitConfigSource, RunContext, RunnerBootstrap } from './contracts';

type RunnerConfigConsumerFactory = typeof createRunnerConfigConsumerFromEnvironment;
type RunnerConfigStorageExporter = typeof exportRunnerConfigStorageEnvironment;

export interface StorageJitConfigSourceOptions {
  createConsumer?: RunnerConfigConsumerFactory;
  environment?: NodeJS.ProcessEnv;
  exportEnvironment?: RunnerConfigStorageExporter;
}

function storageContextFingerprint(context: RunnerConfigStorageContext): string {
  return JSON.stringify(Object.entries(context).sort(([left], [right]) => left.localeCompare(right)));
}

/** Adapts the shared provider registry to the lifecycle's one-time bootstrap contract. */
export class StorageJitConfigSource implements JitConfigSource {
  private readonly createConsumer: RunnerConfigConsumerFactory;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly exportEnvironment: RunnerConfigStorageExporter;
  private exportedStorageFingerprint?: string;

  public constructor(options: StorageJitConfigSourceOptions = {}) {
    this.createConsumer = options.createConsumer ?? createRunnerConfigConsumerFromEnvironment;
    this.environment = options.environment ?? process.env;
    this.exportEnvironment = options.exportEnvironment ?? exportRunnerConfigStorageEnvironment;
  }

  public async consume(context: RunContext, options: ConsumeOptions): Promise<RunnerBootstrap> {
    const fingerprint = storageContextFingerprint(context.storage);
    if (this.exportedStorageFingerprint === undefined) {
      this.exportEnvironment(context.storage, this.environment);
      this.exportedStorageFingerprint = fingerprint;
    } else if (this.exportedStorageFingerprint !== fingerprint) {
      throw new Error('runner configuration storage context cannot change after initialization');
    }

    const consumer: RunnerConfigConsumer = this.createConsumer(this.environment);
    const jitConfig = await consumer.consume(context.microvmId, options);
    return { jitConfig };
  }
}

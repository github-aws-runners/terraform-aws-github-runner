export interface RunnerConfigMetadataTag {
  key: string;
  value: string;
}

export interface RunnerConfigRecord {
  runnerId: string;
  value: string;
}

export interface RunnerConfigStore {
  readonly maxWritesPerSecond?: number;
  create(record: RunnerConfigRecord, options?: { metadataTags?: RunnerConfigMetadataTag[] }): Promise<void>;
}

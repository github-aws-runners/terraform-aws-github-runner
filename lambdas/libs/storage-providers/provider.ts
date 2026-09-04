export const runnerConfigStorageProviders = ['aws_ssm'] as const;

export type RunnerConfigStorageProvider = (typeof runnerConfigStorageProviders)[number];

export function resolveRunnerConfigStorageProvider(value: unknown): RunnerConfigStorageProvider {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return 'aws_ssm';
  }
  if (
    typeof value !== 'string' ||
    !runnerConfigStorageProviders.includes(value.trim().toLowerCase() as RunnerConfigStorageProvider)
  ) {
    throw new Error(`Unsupported runner config storage provider '${String(value)}'`);
  }
  return value.trim().toLowerCase() as RunnerConfigStorageProvider;
}

export const runnerConfigStorageProvider = {
  awsSsm: 'aws_ssm',
  awsDynamodb: 'aws_dynamodb',
} as const;
export const runnerConfigStorageProviders = [
  runnerConfigStorageProvider.awsSsm,
  runnerConfigStorageProvider.awsDynamodb,
] as const;

export type RunnerConfigStorageProvider = (typeof runnerConfigStorageProviders)[number];

export function resolveRunnerConfigStorageProvider(value: unknown): RunnerConfigStorageProvider {
  if (value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return runnerConfigStorageProvider.awsSsm;
  }
  if (
    typeof value !== 'string' ||
    !runnerConfigStorageProviders.includes(value.trim().toLowerCase() as RunnerConfigStorageProvider)
  ) {
    throw new Error(`Unsupported runner config storage provider '${String(value)}'`);
  }
  return value.trim().toLowerCase() as RunnerConfigStorageProvider;
}

export const runnerConfigStorageProviders = ['aws_ssm'] as const;

export type RunnerConfigStorageProvider = (typeof runnerConfigStorageProviders)[number];

const defaultProvider = 'aws_ssm' satisfies RunnerConfigStorageProvider;

export function resolveRunnerConfigStorageProvider(provider: unknown): RunnerConfigStorageProvider {
  if (provider === undefined) {
    return defaultProvider;
  }

  if (typeof provider !== 'string') {
    throw new Error(`Unsupported runner config storage provider '${String(provider)}'`);
  }

  const normalizedProvider = provider.trim().toLowerCase();
  if (normalizedProvider === '') {
    return defaultProvider;
  }

  if (!runnerConfigStorageProviders.includes(normalizedProvider as RunnerConfigStorageProvider)) {
    throw new Error(`Unsupported runner config storage provider '${String(provider)}'`);
  }

  return normalizedProvider as RunnerConfigStorageProvider;
}

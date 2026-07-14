// TODO: Add MicroVM when its webhook provider strategy is implemented.
export type RunnerProvider = 'ec2';

const defaultRunnerProvider: RunnerProvider = 'ec2';

export function normalizeRunnerProvider(provider: unknown): RunnerProvider | undefined {
  if (provider === undefined) return defaultRunnerProvider;
  if (typeof provider !== 'string') return undefined;

  const normalizedProvider = provider.trim().toLowerCase();
  if (!normalizedProvider) return defaultRunnerProvider;

  return normalizedProvider === 'ec2' ? normalizedProvider : undefined;
}

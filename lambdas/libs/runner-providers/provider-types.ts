export const runnerProviderTypes = ['ec2', 'microvm'] as const;

export type RunnerProviderType = (typeof runnerProviderTypes)[number];

export const defaultRunnerProvider = 'ec2' satisfies RunnerProviderType;

export function resolveRunnerProviderType(type: unknown): RunnerProviderType {
  if (type === undefined) return defaultRunnerProvider;
  if (typeof type !== 'string') {
    throw new Error(`Unsupported runner provider type '${String(type)}'`);
  }

  const normalizedType = type.trim().toLowerCase();
  if (!normalizedType) return defaultRunnerProvider;

  const runnerProviderType = runnerProviderTypes.find((provider) => provider === normalizedType);
  if (!runnerProviderType) {
    throw new Error(`Unsupported runner provider type '${String(type)}'`);
  }

  return runnerProviderType;
}

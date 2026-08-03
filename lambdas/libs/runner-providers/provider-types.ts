export const runnerProviderTypes = ['ec2'] as const;

export type RunnerProviderType = (typeof runnerProviderTypes)[number];

export const defaultRunnerProvider = 'ec2' satisfies RunnerProviderType;

export function normalizeRunnerProviderType(type: unknown): RunnerProviderType | undefined {
  if (type === undefined) return defaultRunnerProvider;
  if (typeof type !== 'string') return undefined;

  const normalizedType = type.trim().toLowerCase();
  if (!normalizedType) return defaultRunnerProvider;

  return runnerProviderTypes.find((runnerProviderType) => runnerProviderType === normalizedType);
}

export function resolveRunnerProviderType(type: unknown): RunnerProviderType {
  const normalizedType = normalizeRunnerProviderType(type);
  if (!normalizedType) {
    throw new Error(`Unsupported runner provider type '${String(type)}'`);
  }

  return normalizedType;
}

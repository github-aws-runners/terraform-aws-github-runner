// TODO: Add MicroVM when its webhook and control-plane provider implementations are available.
const runnerProviderTypes = ['ec2'] as const;
export type RunnerProviderType = (typeof runnerProviderTypes)[number];

const defaultRunnerProvider: RunnerProviderType = 'ec2';

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

export interface RunnerProvider {
  type: RunnerProviderType;
}

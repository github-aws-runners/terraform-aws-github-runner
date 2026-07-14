// TODO: Add MicroVM when its control-plane provider implementations are available.
export type RunnerProviderType = 'ec2';

const defaultRunnerProvider: RunnerProviderType = 'ec2';

export function resolveRunnerProviderType(type: unknown): RunnerProviderType {
  if (type === undefined) return defaultRunnerProvider;
  if (typeof type !== 'string') {
    throw new Error(`Unsupported runner provider type '${String(type)}'`);
  }

  const normalizedType = type.trim().toLowerCase();
  if (!normalizedType) return defaultRunnerProvider;
  if (normalizedType !== 'ec2') {
    throw new Error(`Unsupported runner provider type '${type}'`);
  }

  return normalizedType;
}

export interface RunnerProvider {
  type: RunnerProviderType;
}

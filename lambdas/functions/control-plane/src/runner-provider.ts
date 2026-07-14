// TODO: Add MicroVM when its control-plane provider implementations are available.
const runnerProviderTypes = ['ec2'] as const;
export type RunnerProviderType = (typeof runnerProviderTypes)[number];

const defaultRunnerProvider: RunnerProviderType = 'ec2';

function isRunnerProviderType(type: string): type is RunnerProviderType {
  return runnerProviderTypes.some((runnerProviderType) => runnerProviderType === type);
}

export function resolveRunnerProviderType(type: unknown): RunnerProviderType {
  if (type === undefined) return defaultRunnerProvider;
  if (typeof type !== 'string') {
    throw new Error(`Unsupported runner provider type '${String(type)}'`);
  }

  const normalizedType = type.trim().toLowerCase();
  if (!normalizedType) return defaultRunnerProvider;
  if (!isRunnerProviderType(normalizedType)) {
    throw new Error(`Unsupported runner provider type '${type}'`);
  }

  return normalizedType;
}

export interface RunnerProvider {
  type: RunnerProviderType;
}

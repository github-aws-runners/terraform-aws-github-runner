// TODO: Add MicroVM when its control-plane provider implementations are available.
export type RunnerProviderType = 'ec2';

export function normalizeRunnerProviderType(type: string): string {
  return type.trim().toLowerCase();
}

export interface RunnerProvider {
  type: RunnerProviderType;
}

// TODO: Add MicroVM when its control-plane provider strategies are implemented.
export type RunnerProviderType = 'ec2';

export function normalizeRunnerProviderType(type: string): string {
  return type.trim().toLowerCase();
}

export interface RunnerProvider {
  type: RunnerProviderType;
}

export interface RunnerProviderStrategy<TProvider extends RunnerProvider, TCreateFromEnvArgs extends unknown[] = []> {
  type: TProvider['type'];
  createFromEnv(...args: TCreateFromEnvArgs): TProvider;
}

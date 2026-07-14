export type RunnerProviderType = 'ec2' | 'microvm';

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

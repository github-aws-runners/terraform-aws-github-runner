import { enabledRegistrationCleanupProviders } from './providers.config.registration-cleanup';

/** A failed lookup must throw, never report absence. Resource IDs are provider-owned. */
export interface RegistrationCleanupProvider {
  /** Stable representation of all provider settings affecting ownership and lookup scope. */
  scope: string;
  resourceIdFromRunnerName(name: string): string | undefined;
  exists(resourceId: string): Promise<boolean>;
}

export interface RegistrationCleanupProviderModule {
  type: string;
  create(config: unknown, runnerNamePrefix: string): RegistrationCleanupProvider;
}

export interface RegistrationCleanupProviderConfig {
  type: string;
  options: unknown;
}

export function createRegistrationCleanupProvider(
  config: RegistrationCleanupProviderConfig,
  runnerNamePrefix: string,
): RegistrationCleanupProvider {
  const provider = enabledRegistrationCleanupProviders.find((provider) => provider.type === config?.type);
  if (!provider) throw new Error(`Unknown registration cleanup provider: ${config?.type}`);
  return provider.create(config.options, runnerNamePrefix);
}

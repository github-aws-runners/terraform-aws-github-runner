import { normalizeRunnerProviderType } from '../runner-provider';
import { ec2PoolRunnerProviderStrategy } from './ec2-pool';
import type { PoolRunnerProvider, PoolRunnerProviderStrategy, PoolRunnerProviderType } from './pool-provider';

const poolRunnerProviderStrategies: PoolRunnerProviderStrategy[] = [ec2PoolRunnerProviderStrategy];

export function getDefaultPoolRunnerProviderType(): PoolRunnerProviderType {
  return poolRunnerProviderStrategies[0].type;
}

export function createPoolRunnerProviderFromEnv(type: string): PoolRunnerProvider {
  const normalizedType = normalizeRunnerProviderType(type);
  const strategy = poolRunnerProviderStrategies.find((strategy) => strategy.type === normalizedType);

  if (!strategy) {
    throw new Error(`Unsupported pool runner provider type '${type}'`);
  }

  return strategy.createFromEnv();
}

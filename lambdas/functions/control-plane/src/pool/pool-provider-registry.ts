import { ec2PoolRunnerProviderStrategy } from './ec2-pool';
import type { PoolRunnerProvider, PoolRunnerProviderStrategy, PoolRunnerProviderType } from './pool-provider';

const poolRunnerProviderStrategies: PoolRunnerProviderStrategy[] = [ec2PoolRunnerProviderStrategy];

export function createPoolRunnerProviderFromEnv(type: PoolRunnerProviderType): PoolRunnerProvider {
  const strategy = poolRunnerProviderStrategies.find((strategy) => strategy.type === type);

  if (!strategy) {
    throw new Error(`Unsupported pool runner provider type '${type}'`);
  }

  return strategy.createFromEnv();
}

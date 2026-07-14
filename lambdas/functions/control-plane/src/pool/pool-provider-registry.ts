import { createEc2PoolProvider } from './ec2-pool';
import type { PoolRunnerProvider, PoolRunnerProviderType } from './pool-provider';

type PoolRunnerProviderFactory = () => PoolRunnerProvider;

const poolRunnerProviderFactories: Record<PoolRunnerProviderType, PoolRunnerProviderFactory> = {
  ec2: createEc2PoolProvider,
};

export function createPoolRunnerProviderFromEnv(type: PoolRunnerProviderType): PoolRunnerProvider {
  return poolRunnerProviderFactories[type]();
}

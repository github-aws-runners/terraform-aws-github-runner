import type { RunnerProviderType } from '../runner-provider';
import { createEc2PoolProvider } from './ec2-pool';
import type { PoolRunnerProvider } from './pool-provider';

type PoolRunnerProviderFactory = () => PoolRunnerProvider;

const poolRunnerProviderFactories: Record<RunnerProviderType, PoolRunnerProviderFactory> = {
  ec2: createEc2PoolProvider,
};

export function createPoolRunnerProviderFromEnv(type: RunnerProviderType): PoolRunnerProvider {
  return poolRunnerProviderFactories[type]();
}

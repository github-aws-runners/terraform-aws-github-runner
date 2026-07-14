import { createEc2PoolProviderFromEnv } from './ec2-pool';
import type { PoolRunnerProvider } from './pool-provider';

export function createPoolRunnerProviderFromEnv(): PoolRunnerProvider {
  return createEc2PoolProviderFromEnv();
}

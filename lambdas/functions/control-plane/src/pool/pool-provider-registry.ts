import { normalizeRunnerProviderType } from '../runner-provider';
import { createEc2PoolProviderFromEnv } from './ec2-pool';
import type { PoolRunnerProvider, PoolRunnerProviderType } from './pool-provider';

export function getDefaultPoolRunnerProviderType(): PoolRunnerProviderType {
  return 'ec2';
}

export function createPoolRunnerProviderFromEnv(type: string): PoolRunnerProvider {
  if (normalizeRunnerProviderType(type) !== 'ec2') {
    throw new Error(`Unsupported pool runner provider type '${type}'`);
  }

  return createEc2PoolProviderFromEnv();
}

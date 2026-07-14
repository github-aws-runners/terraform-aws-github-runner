import { normalizeRunnerProviderType } from '../runner-provider';
import { createEc2ScaleDownProvider } from './ec2-scale-down';
import type { ScaleDownRunnerProvider } from './scale-down-provider';

export function createScaleDownRunnerProviderFromEnv(type: string): ScaleDownRunnerProvider {
  if (normalizeRunnerProviderType(type) !== 'ec2') {
    throw new Error(`Unsupported scale-down runner provider type '${type}'`);
  }

  return createEc2ScaleDownProvider();
}

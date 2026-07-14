import { normalizeRunnerProviderType } from '../runner-provider';
import { createEc2ScaleDownProvider } from './ec2-scale-down';
import type { ScaleDownRunnerProvider, ScaleDownRunnerProviderType } from './scale-down-provider';

export function getDefaultScaleDownRunnerProviderType(): ScaleDownRunnerProviderType {
  return 'ec2';
}

export function createScaleDownRunnerProviderFromEnv(type: string): ScaleDownRunnerProvider {
  if (normalizeRunnerProviderType(type) !== 'ec2') {
    throw new Error(`Unsupported scale-down runner provider type '${type}'`);
  }

  return createEc2ScaleDownProvider();
}

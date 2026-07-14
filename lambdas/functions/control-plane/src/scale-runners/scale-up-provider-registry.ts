import { normalizeRunnerProviderType } from '../runner-provider';
import { createEc2ScaleUpProviderFromEnv } from './ec2-scale-up';
import type { ScaleUpRunnerProvider, ScaleUpRunnerProviderType } from './scale-up-provider';

export function getDefaultScaleUpRunnerProviderType(): ScaleUpRunnerProviderType {
  return 'ec2';
}

export function createScaleUpRunnerProviderFromEnv(
  type: string,
  environment: string,
  scaleErrors: string[],
): ScaleUpRunnerProvider {
  if (normalizeRunnerProviderType(type) !== 'ec2') {
    throw new Error(`Unsupported scale-up runner provider type '${type}'`);
  }

  return createEc2ScaleUpProviderFromEnv(environment, scaleErrors);
}

import { createEc2ScaleUpProviderFromEnv } from './ec2-scale-up';
import type { ScaleUpRunnerProvider } from './scale-up-provider';

export function createScaleUpRunnerProviderFromEnv(environment: string, scaleErrors: string[]): ScaleUpRunnerProvider {
  return createEc2ScaleUpProviderFromEnv(environment, scaleErrors);
}

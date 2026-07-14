import { createEc2ScaleDownProvider } from './ec2-scale-down';
import type { ScaleDownRunnerProvider } from './scale-down-provider';

export function createScaleDownRunnerProviderFromEnv(): ScaleDownRunnerProvider {
  return createEc2ScaleDownProvider();
}

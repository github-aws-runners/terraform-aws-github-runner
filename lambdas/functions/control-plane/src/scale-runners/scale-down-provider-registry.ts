import type { RunnerProviderType } from '../runner-provider';
import { createEc2ScaleDownProvider } from './ec2-scale-down';
import type { ScaleDownRunnerProvider } from './scale-down-provider';

type ScaleDownRunnerProviderFactory = () => ScaleDownRunnerProvider;

const scaleDownRunnerProviderFactories: Record<RunnerProviderType, ScaleDownRunnerProviderFactory> = {
  ec2: createEc2ScaleDownProvider,
};

export function createScaleDownRunnerProvider(type: RunnerProviderType): ScaleDownRunnerProvider {
  return scaleDownRunnerProviderFactories[type]();
}

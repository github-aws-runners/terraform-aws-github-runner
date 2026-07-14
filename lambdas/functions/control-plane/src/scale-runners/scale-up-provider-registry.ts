import type { RunnerProviderType } from '../runner-provider';
import { createEc2ScaleUpProvider } from './ec2-scale-up';
import type { ScaleUpRunnerProvider } from './scale-up-provider';

type ScaleUpRunnerProviderFactory = () => Omit<ScaleUpRunnerProvider, 'type'>;

const scaleUpRunnerProviderFactories: Record<RunnerProviderType, ScaleUpRunnerProviderFactory> = {
  ec2: createEc2ScaleUpProvider,
};

export function createScaleUpRunnerProvider(type: RunnerProviderType): ScaleUpRunnerProvider {
  return { ...scaleUpRunnerProviderFactories[type](), type };
}

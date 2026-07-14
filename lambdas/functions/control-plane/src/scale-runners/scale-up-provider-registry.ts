import { normalizeRunnerProviderType } from '../runner-provider';
import { ec2ScaleUpRunnerProviderStrategy } from './ec2-scale-up';
import type {
  ScaleUpRunnerProvider,
  ScaleUpRunnerProviderStrategy,
  ScaleUpRunnerProviderType,
} from './scale-up-provider';

const scaleUpRunnerProviderStrategies: ScaleUpRunnerProviderStrategy[] = [ec2ScaleUpRunnerProviderStrategy];

export function getDefaultScaleUpRunnerProviderType(): ScaleUpRunnerProviderType {
  return scaleUpRunnerProviderStrategies[0].type;
}

export function createScaleUpRunnerProviderFromEnv(
  type: string,
  environment: string,
  scaleErrors: string[],
): ScaleUpRunnerProvider {
  const normalizedType = normalizeRunnerProviderType(type);
  const strategy = scaleUpRunnerProviderStrategies.find((strategy) => strategy.type === normalizedType);

  if (!strategy) {
    throw new Error(`Unsupported scale-up runner provider type '${type}'`);
  }

  return strategy.createFromEnv({ environment, scaleErrors });
}

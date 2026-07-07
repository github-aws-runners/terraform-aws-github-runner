import { ec2ScaleDownRunnerProviderStrategy } from './ec2-scale-down';
import type {
  ScaleDownRunnerProvider,
  ScaleDownRunnerProviderStrategy,
  ScaleDownRunnerProviderType,
} from './scale-down-provider';

const scaleDownRunnerProviderStrategies: ScaleDownRunnerProviderStrategy[] = [ec2ScaleDownRunnerProviderStrategy];

export function getDefaultScaleDownRunnerProviderType(): ScaleDownRunnerProviderType {
  return scaleDownRunnerProviderStrategies[0].type;
}

export function createScaleDownRunnerProvider(type: ScaleDownRunnerProviderType): ScaleDownRunnerProvider {
  const strategy = scaleDownRunnerProviderStrategies.find((strategy) => strategy.type === type);

  if (!strategy) {
    throw new Error(`Unsupported scale-down runner provider type: ${type}`);
  }

  return strategy.create();
}

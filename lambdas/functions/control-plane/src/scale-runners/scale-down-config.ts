import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import parser from 'cron-parser';
import moment from 'moment';

import { normalizeRunnerProviderType } from '../runner-provider';
import type { ScaleDownRunnerProviderType } from './scale-down-provider';

export type ScalingDownConfigList = ScalingDownConfig[];
export type EvictionStrategy = 'newest_first' | 'oldest_first';
export interface ScalingDownConfig {
  type?: string;
  cron: string;
  idleCount: number;
  timeZone: string;
  evictionStrategy?: EvictionStrategy;
}

const logger = createChildLogger('scale-down-config.ts');

function inPeriod(period: ScalingDownConfig): boolean {
  const now = moment(new Date());
  const expr = parser.parse(period.cron, {
    tz: period.timeZone,
  });
  const next = moment(expr.next().toDate());
  return Math.abs(next.diff(now, 'seconds')) < 5; // we keep a range of 5 seconds
}

export function getIdleRunnerCount(scalingDownConfigs: ScalingDownConfigList): number {
  for (const scalingDownConfig of scalingDownConfigs) {
    if (inPeriod(scalingDownConfig)) {
      return scalingDownConfig.idleCount;
    }
  }
  return 0;
}

export function getEvictionStrategy(scalingDownConfigs: ScalingDownConfigList): EvictionStrategy {
  for (const scalingDownConfig of scalingDownConfigs) {
    if (inPeriod(scalingDownConfig)) {
      const evictionStrategy = scalingDownConfig.evictionStrategy ?? 'oldest_first';
      logger.debug(`Using evictionStrategy '${evictionStrategy}' for period ${scalingDownConfig.cron}`);
      return evictionStrategy;
    }
  }
  return 'oldest_first';
}

export function getScaleDownRunnerProviderType(
  scalingDownConfigs: ScalingDownConfigList,
  defaultType: ScaleDownRunnerProviderType,
): string {
  const configuredTypes = new Map<string, string>();
  for (const scalingDownConfig of scalingDownConfigs) {
    const configuredType = scalingDownConfig.type?.trim() ? scalingDownConfig.type : defaultType;
    configuredTypes.set(normalizeRunnerProviderType(configuredType), configuredType);
  }

  if (configuredTypes.size > 1) {
    throw new Error(`Multiple scale-down runner provider types are not supported in a single scale-down config.`);
  }

  return configuredTypes.values().next().value ?? defaultType;
}

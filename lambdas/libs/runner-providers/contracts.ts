import type {
  CreateStartRunnerConfig,
  PoolRunnerProvider,
  RunnerProviderPlugin,
  ScaleDownRunnerProvider,
  ScaleUpRunnerProvider,
} from './core';
import type { RunnerProviderType } from './provider-types';

export interface AwsDynamicLabelsValueRule {
  allowed?: string[];
  denied?: string[];
  max?: number | string;
}

export interface AwsDynamicLabelsPolicy {
  blocked_keys?: string[];
  restricted_keys?: Record<string, AwsDynamicLabelsValueRule>;
}

export interface MatcherConfig {
  labelMatchers: string[][];
  exactMatch: boolean;
  bidirectionalLabelMatch?: boolean;
  enableDynamicLabels?: boolean;
  awsDynamicLabelsPolicy?: AwsDynamicLabelsPolicy | null;
  // TODO: Remove this legacy compatibility field and fallback in the next release.
  /** @deprecated Use awsDynamicLabelsPolicy. Retained while existing SSM configurations migrate. */
  ec2DynamicLabelsPolicy?: AwsDynamicLabelsPolicy | null;
}

export interface RunnerMatcherConfig {
  id: string;
  arn: string;
  runnerProvider?: RunnerProviderType;
  matcherConfig: MatcherConfig;
}

export type RunnerConfig = RunnerMatcherConfig[];

export interface DynamicLabelDispatchTarget {
  queue: RunnerMatcherConfig;
  labels: string[];
}

export interface DynamicLabelProvider {
  selectQueue(input: {
    queue: RunnerMatcherConfig;
    nonGhrLabels: string[];
    sanitizedGhrLabels: string[];
  }): DynamicLabelDispatchTarget | undefined;
}

export interface ControlPlaneProviderCapabilities {
  pool: () => Omit<PoolRunnerProvider, 'type'>;
  scaleUp: () => Omit<ScaleUpRunnerProvider, 'type'>;
  scaleDown: () => Omit<ScaleDownRunnerProvider, 'type'>;
}

export interface WebhookProviderCapabilities {
  dynamicLabels: DynamicLabelProvider;
}

export interface ControlPlaneProviderModule<TType extends string = string> {
  type: TType;
  createPlugin(
    createStartRunnerConfig: CreateStartRunnerConfig,
  ): RunnerProviderPlugin<ControlPlaneProviderCapabilities, TType>;
}

export interface WebhookProviderModule<TType extends string = string> {
  type: TType;
  createPlugin(): RunnerProviderPlugin<WebhookProviderCapabilities, TType>;
}

import type {
  CreateStartRunnerConfig,
  PoolComputeProvider,
  ComputeProviderPlugin,
  ScaleDownComputeProvider,
  ScaleUpComputeProvider,
} from './core';
import type { ComputeProviderType } from './provider-types';

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
  computeProvider?: ComputeProviderType;
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
  pool: () => Omit<PoolComputeProvider, 'type'>;
  scaleUp: () => Omit<ScaleUpComputeProvider, 'type'>;
  scaleDown: () => Omit<ScaleDownComputeProvider, 'type'>;
}

export interface WebhookProviderCapabilities {
  dynamicLabels: DynamicLabelProvider;
}

export interface ControlPlaneProviderModule<TType extends string = string> {
  type: TType;
  createPlugin(
    createStartRunnerConfig: CreateStartRunnerConfig,
  ): ComputeProviderPlugin<ControlPlaneProviderCapabilities, TType>;
}

export interface WebhookProviderModule<TType extends string = string> {
  type: TType;
  createPlugin(): ComputeProviderPlugin<WebhookProviderCapabilities, TType>;
}

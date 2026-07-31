import type {
  CreateStartRunnerConfig,
  PoolRunnerProvider,
  RunnerProviderPlugin,
  ScaleDownRunnerProvider,
  ScaleUpRunnerProvider,
} from './core';

export interface AwsDynamicLabelsValueRule {
  allowed?: string[];
  denied?: string[];
  max?: number | string;
}

export interface AwsDynamicLabelsPolicy {
  blocked_keys?: string[];
  restricted_keys?: Record<string, AwsDynamicLabelsValueRule>;
}

export interface AwsRunnerMatcherConfig {
  id: string;
  arn: string;
  runnerProvider?: string;
  matcherConfig: {
    labelMatchers: string[][];
    exactMatch: boolean;
    bidirectionalLabelMatch?: boolean;
    enableDynamicLabels?: boolean;
    awsDynamicLabelsPolicy?: AwsDynamicLabelsPolicy | null;
    ec2DynamicLabelsPolicy?: AwsDynamicLabelsPolicy | null;
  };
}

export interface DynamicLabelDispatchTarget {
  queue: AwsRunnerMatcherConfig;
  labels: string[];
}

export interface DynamicLabelProvider {
  selectQueue(input: {
    queue: AwsRunnerMatcherConfig;
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

export interface RunnerProviderModule<TType extends string = string> {
  type: TType;
  createControlPlanePlugin(
    createStartRunnerConfig: CreateStartRunnerConfig,
  ): RunnerProviderPlugin<ControlPlaneProviderCapabilities, TType>;
  webhookPlugin: RunnerProviderPlugin<WebhookProviderCapabilities, TType>;
}

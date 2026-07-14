import type { RunnerProvider } from '../runner-provider';
import type { RunnerMatcherConfig } from '../sqs';

export interface AwsDynamicLabelDispatchTarget {
  queue: RunnerMatcherConfig;
  labels: string[];
}

export interface SelectAwsDynamicLabelQueueInput {
  queue: RunnerMatcherConfig;
  nonGhrLabels: string[];
  sanitizedGhrLabels: string[];
}

export interface AwsDynamicLabelProviderStrategy {
  type: RunnerProvider;
  selectQueue(input: SelectAwsDynamicLabelQueueInput): AwsDynamicLabelDispatchTarget | undefined;
}

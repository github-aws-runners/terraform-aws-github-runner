import { Metrics } from '@aws-lambda-powertools/metrics';
import { MetricUnit } from '@aws-lambda-powertools/metrics/types';

export const metrics = new Metrics({
  defaultDimensions: {},
});

export function createSingleMetric(
  name: string,
  unit: MetricUnit,
  value: number,
  dimensions: Record<string, string> = {},
): ReturnType<typeof metrics.singleMetric> {
  const singleMetric = metrics.singleMetric();

  for (const dimension in dimensions) {
    if (Object.prototype.hasOwnProperty.call(dimensions, dimension)) {
      singleMetric.addDimension(dimension, dimensions[dimension]);
    }
  }
  singleMetric.addMetric(name, unit, value);
  return singleMetric;
}

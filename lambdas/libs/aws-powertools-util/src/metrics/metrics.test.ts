import { MetricUnit, Metrics } from '@aws-lambda-powertools/metrics';
import { createSingleMetric } from '../';
import { describe, test, expect, beforeEach, vi } from 'vitest';

process.env.POWERTOOLS_METRICS_NAMESPACE = 'test';

describe('A root tracer.', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('should create a single metric without dimensions', () => {
    const spy = vi.spyOn(Metrics.prototype, 'singleMetric');
    createSingleMetric('test', MetricUnit.Count, 1);
    expect(spy).toHaveBeenCalled();
  });

  test('should create a single metric', () => {
    const spy = vi.spyOn(Metrics.prototype, 'singleMetric');
    createSingleMetric('test', MetricUnit.Count, 1, { test: 'test' });
    expect(spy).toHaveBeenCalled();
  });
});

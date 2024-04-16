import { MetricUnits, Metrics } from '@aws-lambda-powertools/metrics';
import { createSingleMetric } from '../';

process.env.POWERTOOLS_METRICS_NAMESPACE = 'test';

describe('A root tracer.', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('should create a single metric without dimensions', () => {
    const spy = jest.spyOn(Metrics.prototype, 'singleMetric');
    createSingleMetric('test', MetricUnits.Count, 1);
    expect(spy).toHaveBeenCalled();
  });

  test('should create a single metric', () => {
    const spy = jest.spyOn(Metrics.prototype, 'singleMetric');
    createSingleMetric('test', MetricUnits.Count, 1, { test: 'test' });
    expect(spy).toHaveBeenCalled();
  });
});

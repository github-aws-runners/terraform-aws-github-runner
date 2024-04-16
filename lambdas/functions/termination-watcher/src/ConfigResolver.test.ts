import { Config } from './ConfigResolver';

process.env.ENABLE_METRICS_SPOT_WARNING = 'true';

describe('Test ConfigResolver', () => {
  const data = [
    {
      description: 'metric with tag filter',
      input: { createSpotWarningMetric: true, tagFilters: '{"ghr:abc": "test"}', prefix: undefined },
      output: { createSpotWarningMetric: true, tagFilters: { 'ghr:abc': 'test' } },
    },
    {
      description: 'no metric with no filter',
      input: { createSpotWarningMetric: false, prefix: 'test' },
      output: { createSpotWarningMetric: false, tagFilters: { 'ghr:environment': 'test' } },
    },
    {
      description: 'no metric with invalid filter',
      input: { createSpotWarningMetric: false, tagFilters: '{"ghr:" "test"', prefix: 'runners' },
      output: { createSpotWarningMetric: false, tagFilters: { 'ghr:environment': 'runners' } },
    },
    {
      description: 'no metric with null filter',
      input: { createSpotWarningMetric: false, tagFilters: 'null', prefix: 'runners' },
      output: { createSpotWarningMetric: false, tagFilters: { 'ghr:environment': 'runners' } },
    },
    {
      description: 'undefined input',
      input: { createSpotWarningMetric: undefined, tagFilters: undefined, prefix: undefined },
      output: { createSpotWarningMetric: false, tagFilters: { 'ghr:environment': '' } },
    },
  ];

  describe.each(data)('Should check configuration for: $description', ({ description, input, output }) => {
    beforeEach(() => {
      delete process.env.ENABLE_METRICS_SPOT_WARNING;
      delete process.env.PREFIX;
      delete process.env.TAG_FILTERS;
    });

    it(description, async () => {
      if (input.createSpotWarningMetric !== undefined) {
        process.env.ENABLE_METRICS_SPOT_WARNING = input.createSpotWarningMetric ? 'true' : 'false';
      }
      if (input.tagFilters) {
        process.env.TAG_FILTERS = input.tagFilters;
      }
      if (input.prefix) {
        process.env.PREFIX = input.prefix;
      }

      const config = new Config();
      expect(config.createSpotWarningMetric).toBe(output.createSpotWarningMetric);
      expect(config.tagFilters).toEqual(output.tagFilters);
    });
  });
});

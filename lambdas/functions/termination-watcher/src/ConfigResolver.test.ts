import { Config } from './ConfigResolver';
import { describe, it, expect, beforeEach } from 'vitest';

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
      delete process.env.ENABLE_RUNNER_DEREGISTRATION;
      delete process.env.GHES_URL;
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

  describe('runner deregistration config', () => {
    beforeEach(() => {
      delete process.env.ENABLE_RUNNER_DEREGISTRATION;
      delete process.env.GHES_URL;
    });

    it('should default to disabled', () => {
      const config = new Config();
      expect(config.enableRunnerDeregistration).toBe(false);
      expect(config.ghesApiUrl).toBe('');
    });

    it('should enable deregistration when env var is true', () => {
      process.env.ENABLE_RUNNER_DEREGISTRATION = 'true';
      const config = new Config();
      expect(config.enableRunnerDeregistration).toBe(true);
    });

    it('should set GHES URL when provided', () => {
      process.env.GHES_URL = 'https://github.internal.co/api/v3';
      const config = new Config();
      expect(config.ghesApiUrl).toBe('https://github.internal.co/api/v3');
    });
  });
});

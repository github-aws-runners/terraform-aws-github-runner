import { ResponseHeaders } from '@octokit/types';
import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { metricGitHubAppRateLimit } from './rate-limit';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getParameter } from '@aws-github-runner/aws-ssm-util';

process.env.PARAMETER_GITHUB_APP_ID_NAME = 'test';
vi.mock('@aws-github-runner/aws-ssm-util', async () => {
  // Return only what we need without spreading actual
  return {
    getParameter: vi.fn((name: string) => {
      if (name === process.env.PARAMETER_GITHUB_APP_ID_NAME) {
        return '1234';
      } else {
        return '';
      }
    }),
  };
});

vi.mock('@aws-github-runner/aws-powertools-util', async () => {
  // Provide only what's needed without spreading actual
  return {
    // Mock the logger
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createSingleMetric: vi.fn((name: string, unit: string, value: number, dimensions?: Record<string, string>) => {
      return {
        addMetadata: vi.fn(),
      };
    }),
  };
});

describe('metricGitHubAppRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update rate limit metric', async () => {
    // set process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT to true
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';
    const headers: ResponseHeaders = {
      'x-ratelimit-remaining': '10',
      'x-ratelimit-limit': '60',
    };

    await metricGitHubAppRateLimit(headers);

    expect(createSingleMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 10, {
      AppId: '1234',
    });
  });

  it('should not update rate limit metric', async () => {
    // set process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT to false
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'false';
    const headers: ResponseHeaders = {
      'x-ratelimit-remaining': '10',
      'x-ratelimit-limit': '60',
    };

    await metricGitHubAppRateLimit(headers);

    expect(createSingleMetric).not.toHaveBeenCalled();
  });

  it('should not update rate limit metric if headers are undefined', async () => {
    // set process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT to true
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';

    await metricGitHubAppRateLimit(undefined as unknown as ResponseHeaders);

    expect(createSingleMetric).not.toHaveBeenCalled();
  });

  it('should cache GitHub App ID and only call getParameter once', async () => {
    // Reset modules to clear the appIdPromises Map cache
    vi.resetModules();
    const { metricGitHubAppRateLimit: freshMetricFunction } = await import('./rate-limit');

    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';
    const headers: ResponseHeaders = {
      'x-ratelimit-remaining': '10',
      'x-ratelimit-limit': '60',
    };

    const mockGetParameter = vi.mocked(getParameter);
    mockGetParameter.mockClear();

    await freshMetricFunction(headers);
    await freshMetricFunction(headers);
    await freshMetricFunction(headers);

    // getParameter should only be called once due to caching (index 0 cached after first call)
    expect(mockGetParameter).toHaveBeenCalledTimes(1);
    // split(':')[0] of 'test' is still 'test'
    expect(mockGetParameter).toHaveBeenCalledWith(process.env.PARAMETER_GITHUB_APP_ID_NAME);
  });
});

describe('metricGitHubAppRateLimit multi-app', () => {
  let freshMetricFunction: typeof metricGitHubAppRateLimit;
  let mockGetParam: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // Reset modules to get a clean appIdPromises Map for each test
    vi.resetModules();

    process.env.PARAMETER_GITHUB_APP_ID_NAME = 'app0:app1';
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';

    mockGetParam = vi.fn((name: string) => {
      if (name === 'app0') return Promise.resolve('1234');
      if (name === 'app1') return Promise.resolve('5678');
      return Promise.resolve('');
    });

    vi.doMock('@aws-github-runner/aws-ssm-util', () => ({ getParameter: mockGetParam }));
    vi.doMock('@aws-github-runner/aws-powertools-util', () => ({
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      createSingleMetric: vi.fn(() => ({ addMetadata: vi.fn() })),
    }));

    const mod = await import('./rate-limit');
    freshMetricFunction = mod.metricGitHubAppRateLimit;
  });

  afterEach(() => {
    vi.resetModules();
    process.env.PARAMETER_GITHUB_APP_ID_NAME = 'test';
  });

  it('should label metric with correct appId for index 0 (primary app)', async () => {
    const { createSingleMetric: mockMetric } = await import('@aws-github-runner/aws-powertools-util');
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '50', 'x-ratelimit-limit': '5000' };
    await freshMetricFunction(headers, 0);
    expect(mockMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 50, { AppId: '1234' });
  });

  it('should label metric with correct appId for index 1 (additional app)', async () => {
    const { createSingleMetric: mockMetric } = await import('@aws-github-runner/aws-powertools-util');
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '100', 'x-ratelimit-limit': '5000' };
    await freshMetricFunction(headers, 1);
    expect(mockMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 100, { AppId: '5678' });
  });

  it('should default to index 0 when no appIndex is passed', async () => {
    const { createSingleMetric: mockMetric } = await import('@aws-github-runner/aws-powertools-util');
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '75', 'x-ratelimit-limit': '5000' };
    await freshMetricFunction(headers);
    expect(mockMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 75, { AppId: '1234' });
  });

  it('should cache per index and call getParameter separately for each index', async () => {
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '10', 'x-ratelimit-limit': '5000' };

    // Two calls with index 1, then one with index 0
    await freshMetricFunction(headers, 1);
    await freshMetricFunction(headers, 1);
    await freshMetricFunction(headers, 0);

    // getParameter should be called exactly once per distinct index
    expect(mockGetParam).toHaveBeenCalledTimes(2);
    expect(mockGetParam).toHaveBeenCalledWith('app1');
    expect(mockGetParam).toHaveBeenCalledWith('app0');
  });
});

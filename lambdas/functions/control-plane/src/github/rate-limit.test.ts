import { ResponseHeaders } from '@octokit/types';
import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { metricGitHubAppRateLimit } from './rate-limit';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getLoadedAppId, reportAppRateLimit } from './auth';

vi.mock('./auth', async () => ({
  // App ids per index, as loaded by the auth module from SSM.
  getLoadedAppId: vi.fn(async (appIndex: number) => [1234, 5678][appIndex]),
  reportAppRateLimit: vi.fn(),
}));

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
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'false';
    const headers: ResponseHeaders = {
      'x-ratelimit-remaining': '10',
      'x-ratelimit-limit': '60',
    };

    await metricGitHubAppRateLimit(headers);

    expect(createSingleMetric).not.toHaveBeenCalled();
  });

  it('should not update rate limit metric if headers are undefined', async () => {
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';

    await metricGitHubAppRateLimit(undefined as unknown as ResponseHeaders);

    expect(createSingleMetric).not.toHaveBeenCalled();
  });

  it('should label metric with correct appId for index 1 (additional app)', async () => {
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '100', 'x-ratelimit-limit': '5000' };

    await metricGitHubAppRateLimit(headers, 1);

    expect(createSingleMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 100, {
      AppId: '5678',
    });
  });

  it('should default to index 0 when no appIndex is passed', async () => {
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '75', 'x-ratelimit-limit': '5000' };

    await metricGitHubAppRateLimit(headers);

    expect(getLoadedAppId).toHaveBeenCalledWith(0);
    expect(createSingleMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 75, {
      AppId: '1234',
    });
  });

  it('feeds the app selector with the remaining budget even when metrics are disabled', async () => {
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'false';
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '4200', 'x-ratelimit-limit': '5000' };

    await metricGitHubAppRateLimit(headers, 1);

    expect(reportAppRateLimit).toHaveBeenCalledWith(1, 4200);
  });

  it('should label metric with an empty AppId when the appIndex is unknown', async () => {
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '75', 'x-ratelimit-limit': '5000' };

    await metricGitHubAppRateLimit(headers, 99);

    expect(createSingleMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 75, {
      AppId: '',
    });
  });
});

import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import type { ResponseHeaders } from '@octokit/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAppId } from './auth';
import { metricGitHubAppRateLimit } from './rate-limit';

vi.mock('./auth', () => ({
  getAppId: vi.fn(),
}));

vi.mock('@aws-github-runner/aws-powertools-util', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  createSingleMetric: vi.fn(() => ({ addMetadata: vi.fn() })),
}));

const cleanEnv = process.env;
const mockedGetAppId = vi.mocked(getAppId);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetAppId.mockReset();
  mockedGetAppId.mockResolvedValue('1234');
  process.env = { ...cleanEnv };
});

describe('metricGitHubAppRateLimit', () => {
  it('updates the rate limit metric', async () => {
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';
    const headers: ResponseHeaders = {
      'x-ratelimit-remaining': '10',
      'x-ratelimit-limit': '60',
    };

    await metricGitHubAppRateLimit(headers);

    expect(mockedGetAppId).toHaveBeenCalledWith(undefined);
    expect(createSingleMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 10, {
      AppId: '1234',
    });
  });

  it('does not update the rate limit metric when disabled', async () => {
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'false';
    const headers: ResponseHeaders = {
      'x-ratelimit-remaining': '10',
      'x-ratelimit-limit': '60',
    };

    await metricGitHubAppRateLimit(headers);

    expect(mockedGetAppId).not.toHaveBeenCalled();
    expect(createSingleMetric).not.toHaveBeenCalled();
  });

  it('does not update the rate limit metric if headers are undefined', async () => {
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';

    await metricGitHubAppRateLimit(undefined as unknown as ResponseHeaders);

    expect(mockedGetAppId).not.toHaveBeenCalled();
    expect(createSingleMetric).not.toHaveBeenCalled();
  });

  it('does not update the metric when the app ID lookup fails', async () => {
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';
    mockedGetAppId.mockRejectedValueOnce(new Error('credential store unavailable'));
    const headers: ResponseHeaders = {
      'x-ratelimit-remaining': '10',
      'x-ratelimit-limit': '60',
    };

    await expect(metricGitHubAppRateLimit(headers)).resolves.not.toThrow();

    expect(createSingleMetric).not.toHaveBeenCalled();
  });
});

describe('metricGitHubAppRateLimit multi-app', () => {
  beforeEach(() => {
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';
    mockedGetAppId.mockImplementation(async (appIndex = 0) => {
      if (appIndex === 0) return '1234';
      if (appIndex === 1) return '5678';
      throw new Error(`GitHub App credential at index ${appIndex} not found`);
    });
  });

  it('labels the metric with the primary app ID', async () => {
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '50', 'x-ratelimit-limit': '5000' };

    await metricGitHubAppRateLimit(headers, 0);

    expect(mockedGetAppId).toHaveBeenCalledWith(0);
    expect(createSingleMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 50, {
      AppId: '1234',
    });
  });

  it('labels the metric with an additional app ID', async () => {
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '100', 'x-ratelimit-limit': '5000' };

    await metricGitHubAppRateLimit(headers, 1);

    expect(mockedGetAppId).toHaveBeenCalledWith(1);
    expect(createSingleMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 100, {
      AppId: '5678',
    });
  });

  it('defaults to the primary app when no app index is passed', async () => {
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '75', 'x-ratelimit-limit': '5000' };

    await metricGitHubAppRateLimit(headers);

    expect(mockedGetAppId).toHaveBeenCalledWith(undefined);
    expect(createSingleMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 75, {
      AppId: '1234',
    });
  });

  it('forwards each app index to the shared credential accessor', async () => {
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '10', 'x-ratelimit-limit': '5000' };

    await metricGitHubAppRateLimit(headers, 1);
    await metricGitHubAppRateLimit(headers, 1);
    await metricGitHubAppRateLimit(headers, 0);

    expect(mockedGetAppId).toHaveBeenNthCalledWith(1, 1);
    expect(mockedGetAppId).toHaveBeenNthCalledWith(2, 1);
    expect(mockedGetAppId).toHaveBeenNthCalledWith(3, 0);
  });
});

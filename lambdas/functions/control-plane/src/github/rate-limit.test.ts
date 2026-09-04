import { ResponseHeaders } from '@octokit/types';
import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAppId } from './auth';
import { metricGitHubAppRateLimit } from './rate-limit';

vi.mock('./auth', () => ({
  getAppId: vi.fn(),
}));
vi.mock('@aws-github-runner/aws-powertools-util', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  createSingleMetric: vi.fn(() => ({ addMetadata: vi.fn() })),
}));

const mockedGetAppId = vi.mocked(getAppId);

describe('metricGitHubAppRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAppId.mockResolvedValue('1234');
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'true';
  });

  it('updates the rate limit metric using the selected app credential', async () => {
    const headers: ResponseHeaders = {
      'x-ratelimit-remaining': '10',
      'x-ratelimit-limit': '60',
    };

    await metricGitHubAppRateLimit(headers, 1);

    expect(mockedGetAppId).toHaveBeenCalledWith(1);
    expect(createSingleMetric).toHaveBeenCalledWith('GitHubAppRateLimitRemaining', MetricUnit.Count, 10, {
      AppId: '1234',
    });
  });

  it('does not update the metric when disabled', async () => {
    process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT = 'false';

    await metricGitHubAppRateLimit({ 'x-ratelimit-remaining': '10', 'x-ratelimit-limit': '60' });

    expect(createSingleMetric).not.toHaveBeenCalled();
    expect(mockedGetAppId).not.toHaveBeenCalled();
  });

  it('does not throw when headers are unavailable', async () => {
    await expect(metricGitHubAppRateLimit(undefined as unknown as ResponseHeaders)).resolves.not.toThrow();
    expect(createSingleMetric).not.toHaveBeenCalled();
  });

  it('passes each app index to the credential seam', async () => {
    mockedGetAppId.mockImplementation(async (appIndex = 0) => String(1000 + appIndex));
    const headers: ResponseHeaders = { 'x-ratelimit-remaining': '10', 'x-ratelimit-limit': '60' };

    await metricGitHubAppRateLimit(headers, 0);
    await metricGitHubAppRateLimit(headers, 1);

    expect(mockedGetAppId).toHaveBeenNthCalledWith(1, 0);
    expect(mockedGetAppId).toHaveBeenNthCalledWith(2, 1);
  });
});

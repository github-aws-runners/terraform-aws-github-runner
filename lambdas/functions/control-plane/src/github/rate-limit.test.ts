import { ResponseHeaders } from '@octokit/types';
import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { metricGitHubAppRateLimit } from './rate-limit';
import { describe, it, expect, beforeEach, vi } from 'vitest';

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
});

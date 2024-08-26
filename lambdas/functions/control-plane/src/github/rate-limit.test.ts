import { ResponseHeaders } from '@octokit/types';
import { createSingleMetric } from '@terraform-aws-github-runner/aws-powertools-util';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { metricGitHubAppRateLimit } from './rate-limit';

process.env.PARAMETER_GITHUB_APP_ID_NAME = 'test';
jest.mock('@terraform-aws-github-runner/aws-ssm-util', () => ({
  ...jest.requireActual('@terraform-aws-github-runner/aws-ssm-util'),
  // get parameter name from process.env.PARAMETER_GITHUB_APP_ID_NAME rerunt 1234
  getParameter: jest.fn((name: string) => {
    if (name === process.env.PARAMETER_GITHUB_APP_ID_NAME) {
      return '1234';
    } else {
      return '';
    }
  }),
}));

jest.mock('@terraform-aws-github-runner/aws-powertools-util', () => ({
  ...jest.requireActual('@terraform-aws-github-runner/aws-powertools-util'),
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createSingleMetric: jest.fn((name: string, unit: string, value: number, dimensions?: Record<string, string>) => {
    return {
      addMetadata: jest.fn(),
    };
  }),
}));

describe('metricGitHubAppRateLimit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

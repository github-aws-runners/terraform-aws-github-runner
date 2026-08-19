import { ResponseHeaders } from '@octokit/types';
import { createSingleMetric, logger } from '@aws-github-runner/aws-powertools-util';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import yn from 'yn';

import { getAppId } from './auth';

export async function metricGitHubAppRateLimit(headers: ResponseHeaders, appIndex?: number): Promise<void> {
  try {
    const remaining = parseInt(headers['x-ratelimit-remaining'] as string);
    const limit = parseInt(headers['x-ratelimit-limit'] as string);

    logger.debug(`Rate limit remaining: ${remaining}, limit: ${limit}`);

    const updateMetric = yn(process.env.ENABLE_METRIC_GITHUB_APP_RATE_LIMIT);
    if (updateMetric) {
      const appId = await getAppId(appIndex);
      const metric = createSingleMetric('GitHubAppRateLimitRemaining', MetricUnit.Count, remaining, {
        AppId: appId,
      });
      metric.addMetadata('AppId', appId);
    }
  } catch (e) {
    logger.debug(`Error updating rate limit metric`, { error: e });
  }
}

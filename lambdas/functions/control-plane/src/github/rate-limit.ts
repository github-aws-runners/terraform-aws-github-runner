import { ResponseHeaders } from '@octokit/types';
import { createSingleMetric, logger } from '@aws-github-runner/aws-powertools-util';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import yn from 'yn';
import { getParameter } from '@aws-github-runner/aws-ssm-util';

// Cache the app ID per app index to avoid repeated SSM calls across Lambda invocations.
// In multi-app mode PARAMETER_GITHUB_APP_ID_NAME is a ':'-joined list of SSM param names,
// one per app in app-index order; index 0 is the primary app.
const appIdPromises = new Map<number, Promise<string>>();

async function getAppId(appIndex = 0): Promise<string> {
  let cached = appIdPromises.get(appIndex);
  if (!cached) {
    const paramName = process.env.PARAMETER_GITHUB_APP_ID_NAME.split(':')[appIndex];
    cached = getParameter(paramName);
    appIdPromises.set(appIndex, cached);
  }
  return cached;
}

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

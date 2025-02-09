import { createChildLogger, getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { BidEvictedDetail, BidEvictedEvent } from './types';
import { EC2Client } from '@aws-sdk/client-ec2';
import { Config } from './ConfigResolver';
import { metricEvent } from './metric-event';
import { getInstances, tagFilter } from './ec2';

const logger = createChildLogger('termination-handler');

export async function handle(event: BidEvictedEvent<BidEvictedDetail>, config: Config): Promise<void> {
  logger.debug('Received spot termination (BidEvictedEvent):', { event });

  const instanceIds = event.detail.serviceEventDetails?.instanceIdSet;
  await createMetricForInstances(instanceIds, event, config);
}

async function createMetricForInstances(
  instanceIds: string[],
  event: BidEvictedEvent<BidEvictedDetail>,
  config: Config,
): Promise<void> {
  const ec2 = getTracedAWSV3Client(new EC2Client({ region: process.env.AWS_REGION }));

  const instances = await getInstances(ec2, instanceIds);
  logger.debug('Received spot notification termination for:', { instances });

  // check if all tags in config.tagFilter are present on the instance
  for (const instance of instances) {
    const matchFilter = tagFilter(instance, config.tagFilters);

    if (matchFilter) {
      metricEvent(instance, event, config.createSpotTerminationMetric ? 'SpotTermination' : undefined, logger);
    } else {
      logger.debug(
        `Received spot termination but ` +
          `details are not available or instance not matching the tag filter (${config.tagFilters}).`,
      );
    }
  }
}

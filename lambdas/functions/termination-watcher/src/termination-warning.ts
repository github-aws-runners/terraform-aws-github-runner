import { createChildLogger, getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { SpotInterruptionWarning, SpotTerminationDetail } from './types';
import { EC2Client, Instance } from '@aws-sdk/client-ec2';
import { Config } from './ConfigResolver';
import { tagFilter, getInstances } from './ec2';
import { metricEvent } from './metric-event';

const logger = createChildLogger('termination-warning');

async function handle(event: SpotInterruptionWarning<SpotTerminationDetail>, config: Config): Promise<void> {
  logger.debug('Received spot notification warning:', { event });
  const ec2 = getTracedAWSV3Client(new EC2Client({ region: process.env.AWS_REGION }));
  const instances = await getInstances(ec2, [event.detail['instance-id']]);
  logger.debug('Received spot notification warning for:', { instances });

  await createMetricForInstances(instances, event, config);
}

async function createMetricForInstances(
  instances: Instance[],
  event: SpotInterruptionWarning<SpotTerminationDetail>,
  config: Config,
): Promise<void> {
  for (const instance of instances) {
    const matchFilter = tagFilter(instance, config.tagFilters);

    if (matchFilter) {
      metricEvent(instance, event, config.createSpotWarningMetric ? 'SpotInterruptionWarning' : undefined, logger);
    } else {
      logger.debug(
        `Received spot termination notification warning but ` +
          `details are not available or instance not matching the tag filster (${config.tagFilters}).`,
      );
    }
  }
}

export { handle };

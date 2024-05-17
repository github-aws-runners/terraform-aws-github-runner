import {
  createChildLogger,
  createSingleMetric,
  getTracedAWSV3Client,
} from '@terraform-aws-github-runner/aws-powertools-util';
import { SpotInterruptionWarning, SpotTerminationDetail } from './types';
import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { Config } from './ConfigResolver';
import { MetricUnits } from '@aws-lambda-powertools/metrics';

const logger = createChildLogger('termination-warning');

async function handle(event: SpotInterruptionWarning<SpotTerminationDetail>, config: Config): Promise<void> {
  logger.debug('Received spot notification warning:', { event });
  const ec2 = getTracedAWSV3Client(new EC2Client({ region: process.env.AWS_REGION }));
  const instance =
    (await ec2.send(new DescribeInstancesCommand({ InstanceIds: [event.detail['instance-id']] }))).Reservations?.[0]
      .Instances?.[0] ?? null;
  logger.debug('Received spot notification warning for:', { instance });

  // check if all tags in config.tagFilter are present on the instance
  const matchFilter = Object.keys(config.tagFilters).every((key) => {
    return instance?.Tags?.find((tag) => tag.Key === key && tag.Value?.startsWith(config.tagFilters[key]));
  });

  if (matchFilter && instance) {
    const instanceRunningTimeInSeconds = instance.LaunchTime
      ? (new Date(event.time).getTime() - new Date(instance.LaunchTime).getTime()) / 1000
      : undefined;
    logger.info('Received spot notification warning:', {
      instanceId: instance.InstanceId,
      instanceType: instance.InstanceType ?? 'unknown',
      instanceName: instance.Tags?.find((tag) => tag.Key === 'Name')?.Value,
      instanceState: instance.State?.Name,
      instanceLaunchTime: instance.LaunchTime,
      instanceRunningTimeInSeconds,
      tags: instance.Tags,
    });
    if (config.createSpotWarningMetric) {
      const metric = createSingleMetric('SpotInterruptionWarning', MetricUnits.Count, 1, {
        InstanceType: instance.InstanceType ? instance.InstanceType : 'unknown',
        Environment: instance.Tags?.find((tag) => tag.Key === 'ghr:environment')?.Value ?? 'unknown',
      });
      metric.addMetadata('InstanceId', instance.InstanceId ?? 'unknown');
      metric.addMetadata('InstanceType', instance.InstanceType ? instance.InstanceType : 'unknown');
      metric.addMetadata(
        'Environment',
        instance.Tags?.find((tag) => tag.Key === 'ghr:environment')?.Value ?? 'unknown',
      );
    }
  } else {
    logger.debug(
      `Received spot termination notification warning for instance ${event.detail['instance-id']} but ` +
        `details are not available or instance not matching the tag fileter (${config.tagFilters}).`,
    );
  }
}

export { handle };

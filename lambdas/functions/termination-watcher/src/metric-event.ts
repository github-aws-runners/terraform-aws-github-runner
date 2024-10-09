import { createSingleMetric } from '@aws-github-runner/aws-powertools-util';
import { Instance } from '@aws-sdk/client-ec2';
import { MetricUnit } from '@aws-lambda-powertools/metrics';
import { Logger } from '@aws-sdk/types';
import { EventBridgeEvent } from 'aws-lambda';

export async function metricEvent(
  instance: Instance,
  event: EventBridgeEvent<string, unknown>,
  metricName: string | undefined,
  logger: Logger,
): Promise<void> {
  const instanceRunningTimeInSeconds = instance.LaunchTime
    ? (new Date(event.time).getTime() - new Date(instance.LaunchTime).getTime()) / 1000
    : undefined;
  logger.info(`Received spot notification for ${metricName}`, {
    instanceId: instance.InstanceId,
    instanceType: instance.InstanceType ?? 'unknown',
    instanceName: instance.Tags?.find((tag) => tag.Key === 'Name')?.Value,
    instanceState: instance.State?.Name,
    instanceLaunchTime: instance.LaunchTime,
    instanceRunningTimeInSeconds,
    tags: instance.Tags,
  });
  if (metricName) {
    const metric = createSingleMetric(metricName, MetricUnit.Count, 1, {
      InstanceType: instance.InstanceType ? instance.InstanceType : 'unknown',
      Environment: instance.Tags?.find((tag) => tag.Key === 'ghr:environment')?.Value ?? 'unknown',
    });
    metric.addMetadata('InstanceId', instance.InstanceId ?? 'unknown');
    metric.addMetadata('InstanceType', instance.InstanceType ? instance.InstanceType : 'unknown');
    metric.addMetadata('Environment', instance.Tags?.find((tag) => tag.Key === 'ghr:environment')?.Value ?? 'unknown');
  }
}

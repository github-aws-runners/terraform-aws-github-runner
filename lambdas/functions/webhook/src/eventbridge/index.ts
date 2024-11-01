import { EventBridgeClient, PutEventsCommand, PutEventsRequestEntry } from '@aws-sdk/client-eventbridge';

import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

const logger = createChildLogger('eventbridge.ts');

export async function publish(entry: PutEventsRequestEntry): Promise<void> {
  const client = new EventBridgeClient({ region: process.env.AWS_REGION });
  const command = new PutEventsCommand({
    Entries: [entry],
  });

  let result;
  try {
    result = await client.send(command);
  } catch (e) {
    logger.debug(`Failed to send event to EventBridge`, { error: e });
    throw new Error('Failed to send event to EventBridge');
  }

  logger.debug(`Event sent to EventBridge${result.FailedEntryCount === 0 ? '' : ' with ERRORS'}.`, {
    command: command,
    result: result,
  });

  if (result.FailedEntryCount !== 0) {
    throw new Error('Event failed to send to EventBridge.');
  }
}

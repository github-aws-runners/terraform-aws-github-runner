import { logger } from '@aws-github-runner/aws-powertools-util';

import { scaleUpHandler } from './lambda';
import { Context, SQSEvent } from 'aws-lambda';

const sqsEvent: SQSEvent = {
  Records: [
    {
      messageId: 'e8d74d08-644e-42ca-bf82-a67daa6c4dad',
      receiptHandle:
        'AQEBCpLYzDEKq4aKSJyFQCkJduSKZef8SJVOperbYyNhXqqnpFG5k74WygVAJ4O0+9nybRyeOFThvITOaS21/jeHiI5fgaM9YKuI0oGYeWCIzPQsluW5CMDmtvqv1aA8sXQ5n2x0L9MJkzgdIHTC3YWBFLQ2AxSveOyIHwW+cHLIFCAcZlOaaf0YtaLfGHGkAC4IfycmaijV8NSlzYgDuxrC9sIsWJ0bSvk5iT4ru/R4+0cjm7qZtGlc04k9xk5Fu6A+wRxMaIyiFRY+Ya19ykcevQldidmEjEWvN6CRToLgclk=',
      body: JSON.stringify({
        repositoryName: 'self-hosted',
        repositoryOwner: 'test-runners',
        eventType: 'workflow_job',
        id: 987654,
        installationId: 123456789,
      }),
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: '1626450047230',
        SequenceNumber: '18863115285800432640',
        MessageGroupId: '19072',
        SenderId: 'AROA5KW7SQ6TTB3PW6WPH:cicddev-webhook',
        MessageDeduplicationId: '0c458eeb87b7f6d2607301268fd3bf33dd898a49ebd888754ff7db510c4bff1e',
        ApproximateFirstReceiveTimestamp: '1626450077251',
      },
      messageAttributes: {},
      md5OfBody: '4aef3bd70526e152e86426a0938cbec6',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-west-2:916370655143:cicddev-queued-builds',
      awsRegion: 'us-west-2',
    },
  ],
};

const context: Context = {
  awsRequestId: '1',
  callbackWaitsForEmptyEventLoop: false,
  functionName: '',
  functionVersion: '',
  getRemainingTimeInMillis: () => 0,
  invokedFunctionArn: '',
  logGroupName: '',
  logStreamName: '',
  memoryLimitInMB: '',
  done: () => {
    return;
  },
  fail: () => {
    return;
  },
  succeed: () => {
    return;
  },
};

export function run(): void {
  try {
    scaleUpHandler(sqsEvent, context);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : `${e}`;
    logger.error(message, e instanceof Error ? { error: e } : {});
  }
}

run();

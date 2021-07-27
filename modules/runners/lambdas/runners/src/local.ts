import { scaleUp } from './scale-runners/scale-up';

const sqsEvent = {
    Records: [
        {
            messageId: 'e8d74d08-644e-42ca-bf82-a67daa6c4dad',
            // eslint-disable-next-line max-len
            receiptHandle: 'AQEBCpLYzDEKq4aKSJyFQCkJduSKZef8SJVOperbYyNhXqqnpFG5k74WygVAJ4O0+9nybRyeOFThvITOaS21/jeHiI5fgaM9YKuI0oGYeWCIzPQsluW5CMDmtvqv1aA8sXQ5n2x0L9MJkzgdIHTC3YWBFLQ2AxSveOyIHwW+cHLIFCAcZlOaaf0YtaLfGHGkAC4IfycmaijV8NSlzYgDuxrC9sIsWJ0bSvk5iT4ru/R4+0cjm7qZtGlc04k9xk5Fu6A+wRxMaIyiFRY+Ya19ykcevQldidmEjEWvN6CRToLgclk=',
            // eslint-disable-next-line max-len
            body: { "id": 19072, "repositoryName": "ErrBud", "repositoryOwner": "ActionsTest", "eventType": "check_run", "installationId": 5 },
            attributes: {
                ApproximateReceiveCount: '1',
                SentTimestamp: '1626450047230',
                SequenceNumber: '18863115285800432640',
                MessageGroupId: '19072',
                SenderId: 'AROA5KW7SQ6TTB3PW6WPH:cicddev-webhook',
                MessageDeduplicationId: '0c458eeb87b7f6d2607301268fd3bf33dd898a49ebd888754ff7db510c4bff1e',
                ApproximateFirstReceiveTimestamp: '1626450077251'
            },
            messageAttributes: {},
            md5OfBody: '4aef3bd70526e152e86426a0938cbec6',
            eventSource: 'aws:sqs',
            eventSourceARN: 'arn:aws:sqs:us-west-2:916370655143:cicddev-queued-builds.fifo',
            awsRegion: 'us-west-2'
        }
    ]
};
export function run(): void {
    scaleUp(sqsEvent.Records[0].eventSource, sqsEvent.Records[0].body);
}

run();

import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { EC2Client, RunInstancesCommand } from '@aws-sdk/client-ec2';
import { Readable } from 'node:stream';

const CREDENTIALS = { accessKeyId: 'test', secretAccessKey: 'test' };

function cannedResponse(statusCode: number, headers: Record<string, string>, body: string) {
  return {
    handle: async () => ({ response: { statusCode, headers, body: Readable.from([Buffer.from(body)]) } }),
  };
}

async function capture(send: () => Promise<unknown>): Promise<Error> {
  try {
    await send();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Expected the SDK call to fail.');
}

// Runs the middleware stack directly: aws-sdk-client-mock stubs `send` on the client prototype.
function run<TInput extends object>(
  client: EC2Client | DynamoDBClient,
  command: RunInstancesCommand | PutItemCommand,
  input: TInput,
): Promise<unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handler = (command as any).resolveMiddleware(client.middlewareStack, client.config, undefined);
  return handler({ input });
}

/** Deserializes an EC2 error response with the installed SDK, as RunInstances and the Spot API return it. */
export function ec2SdkError(code: string, message = `${code} message`, statusCode = 400): Promise<Error> {
  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<Response><Errors><Error><Code>${code}</Code><Message>${message}</Message></Error></Errors>` +
    '<RequestID>00000000-0000-0000-0000-000000000000</RequestID></Response>';
  const client = new EC2Client({
    region: 'eu-west-1',
    credentials: CREDENTIALS,
    maxAttempts: 1,
    requestHandler: cannedResponse(statusCode, { 'content-type': 'text/xml;charset=UTF-8' }, body),
  });
  const command = new RunInstancesCommand({ MinCount: 1, MaxCount: 1 });
  return capture(() => run(client, command, command.input));
}

/** Deserializes a DynamoDB error response with the installed SDK. */
export function dynamoDbSdkError(code: string, message = `${code} message`): Promise<Error> {
  const client = new DynamoDBClient({
    region: 'eu-west-1',
    credentials: CREDENTIALS,
    maxAttempts: 1,
    requestHandler: cannedResponse(
      400,
      { 'content-type': 'application/x-amz-json-1.0', 'x-amzn-errortype': code },
      JSON.stringify({ __type: `com.amazonaws.dynamodb.v20120810#${code}`, message }),
    ),
  });
  const command = new PutItemCommand({ TableName: 'test', Item: {} });
  return capture(() => run(client, command, command.input));
}

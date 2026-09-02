import { SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSqsClients, sqsConstructorSpy, tracedClients, logger } = vi.hoisted(() => ({
  mockSqsClients: [] as Array<{ sendMessage: ReturnType<typeof vi.fn> }>,
  sqsConstructorSpy: vi.fn(),
  tracedClients: [] as unknown[],
  logger: { debug: vi.fn() },
}));

function MockSQS(this: unknown, config?: unknown) {
  sqsConstructorSpy(config);
  const client = {
    sendMessage: vi.fn().mockResolvedValue({}),
  };
  mockSqsClients.push(client);
  return client;
}

vi.mock('@aws-sdk/client-sqs', () => ({
  SQS: vi.fn(MockSQS),
}));

vi.mock('@aws-github-runner/aws-powertools-util', () => ({
  createChildLogger: vi.fn(() => logger),
  getTracedAWSV3Client: vi.fn((client: unknown) => {
    tracedClients.push(client);
    return client;
  }),
}));

const cleanEnv = process.env;

describe('Test sending message to SQS.', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockSqsClients.length = 0;
    tracedClients.length = 0;
    process.env = { ...cleanEnv };
  });

  afterEach(() => {
    process.env = { ...cleanEnv };
  });

  it('no fifo queue', async () => {
    const queueUrl = 'https://sqs.eu-west-1.amazonaws.com/123456789/queued-builds';
    const message = createMessage(queueUrl);
    const { sendActionRequest } = await import('.');

    // Arrange
    const sqsMessage: SendMessageCommandInput = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
    };

    // Act
    const result = sendActionRequest(message);

    // Assert
    expect(sqsConstructorSpy).toHaveBeenCalledWith({ region: 'eu-west-1' });
    expect(mockSqsClients[0].sendMessage).toHaveBeenCalledWith(sqsMessage);
    expect(tracedClients).toHaveLength(1);
    expect(logger.debug).toHaveBeenCalledTimes(1);
    await expect(result).resolves.not.toThrow();
  });

  it('falls back to AWS_REGION when the queue url is invalid', async () => {
    process.env.AWS_REGION = 'us-east-2';
    const { sendActionRequest } = await import('.');

    await sendActionRequest(createMessage('not-a-valid-url'));

    expect(sqsConstructorSpy).toHaveBeenCalledTimes(1);
    expect(sqsConstructorSpy).toHaveBeenCalledWith({ region: 'us-east-2' });
    expect(mockSqsClients[0].sendMessage).toHaveBeenCalledTimes(1);
    expect(tracedClients).toHaveLength(1);
  });

  it('creates a client without an explicit region when no region can be resolved', async () => {
    delete process.env.AWS_REGION;
    const { sendActionRequest } = await import('.');

    await sendActionRequest(createMessage('not-a-valid-url'));

    expect(sqsConstructorSpy).toHaveBeenCalledTimes(1);
    expect(sqsConstructorSpy).toHaveBeenCalledWith({});
    expect(mockSqsClients[0].sendMessage).toHaveBeenCalledTimes(1);
    expect(tracedClients).toHaveLength(1);
  });

  it('reuses the same client for multiple queues in the same region', async () => {
    const { sendActionRequest } = await import('.');

    await sendActionRequest(createMessage('https://sqs.us-east-1.amazonaws.com/123456789/queue-a'));
    await sendActionRequest(createMessage('https://sqs.us-east-1.amazonaws.com/123456789/queue-b'));

    expect(sqsConstructorSpy).toHaveBeenCalledTimes(1);
    expect(sqsConstructorSpy).toHaveBeenCalledWith({ region: 'us-east-1' });
    expect(mockSqsClients[0].sendMessage).toHaveBeenCalledTimes(2);
    expect(tracedClients).toHaveLength(1);
  });

  it('creates a separate client per region', async () => {
    const { sendActionRequest } = await import('.');

    await sendActionRequest(createMessage('https://sqs.us-east-1.amazonaws.com/123456789/queue-a'));
    await sendActionRequest(createMessage('https://sqs.eu-west-1.amazonaws.com/123456789/queue-b'));

    expect(sqsConstructorSpy).toHaveBeenCalledTimes(2);
    expect(sqsConstructorSpy).toHaveBeenNthCalledWith(1, { region: 'us-east-1' });
    expect(sqsConstructorSpy).toHaveBeenNthCalledWith(2, { region: 'eu-west-1' });
    expect(mockSqsClients).toHaveLength(2);
    expect(mockSqsClients[0].sendMessage).toHaveBeenCalledTimes(1);
    expect(mockSqsClients[1].sendMessage).toHaveBeenCalledTimes(1);
    expect(tracedClients).toHaveLength(2);
  });
});

function createMessage(queueId: string) {
  return {
    eventType: 'type',
    id: 0,
    installationId: 0,
    repositoryName: 'test',
    repositoryOwner: 'owner',
    queueId,
    repoOwnerType: 'Organization',
  };
}

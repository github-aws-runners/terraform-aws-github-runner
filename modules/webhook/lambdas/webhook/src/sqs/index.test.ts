import { SQS } from 'aws-sdk';

import { ActionRequestMessage, GithubWorkflowEvent, sendActionRequest, sendWebhookEventToSecondaryQueue } from '.';
import workflowjob_event from '../../test/resources/github_workflowjob_event.json';

const mockSQS = {
  sendMessage: jest.fn(() => {
    {
      return { promise: jest.fn() };
    }
  }),
};
jest.mock('aws-sdk', () => ({
  SQS: jest.fn().mockImplementation(() => mockSQS),
}));

describe('Test sending message to SQS.', () => {
  const message: ActionRequestMessage = {
    eventType: 'type',
    id: 0,
    installationId: 0,
    repositoryName: 'test',
    repositoryOwner: 'owner',
  };
  const sqsMessage: SQS.Types.SendMessageRequest = {
    QueueUrl: 'https://sqs.eu-west-1.amazonaws.com/123456789/queued-builds',
    MessageBody: JSON.stringify(message),
  };
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('no fifo queue, based on defaults', async () => {
    // Arrange
    process.env.SQS_URL_WEBHOOK = sqsMessage.QueueUrl;

    // Act
    const result = await sendActionRequest(message);

    // Assert
    expect(mockSQS.sendMessage).toBeCalledWith(sqsMessage);
    expect(result).resolves;
  });

  it('no fifo queue', async () => {
    // Arrange
    process.env.SQS_URL_WEBHOOK = sqsMessage.QueueUrl;
    process.env.SQS_IS_FIFO = 'false';

    // Act
    const result = await sendActionRequest(message);

    // Assert
    expect(mockSQS.sendMessage).toBeCalledWith(sqsMessage);
    expect(result).resolves;
  });

  it('use a fifo queue', async () => {
    // Arrange
    process.env.SQS_URL_WEBHOOK = sqsMessage.QueueUrl;
    process.env.SQS_IS_FIFO = 'true';

    // Act
    const result = await sendActionRequest(message);

    // Assert
    expect(mockSQS.sendMessage).toBeCalledWith({ ...sqsMessage, MessageGroupId: String(message.id) });
    expect(result).resolves;
  });
});
describe('Test sending message to SQS.', () => {
  const message: GithubWorkflowEvent = {
    eventType: 'type',
    id: 0,
    jobEvent: JSON.parse(JSON.stringify(workflowjob_event)),
  };
  const sqsMessage: SQS.Types.SendMessageRequest = {
    QueueUrl: 'https://sqs.eu-west-1.amazonaws.com/123456789/sqs-secondary-queue',
    MessageBody: JSON.stringify(message),
  };
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('sends webhook events to secondary queue', async () => {
    // Arrange
    process.env.SQS_SECONDARY_QUEUE = sqsMessage.QueueUrl;

    // Act
    const result = await sendWebhookEventToSecondaryQueue(message);

    // Assert
    expect(mockSQS.sendMessage).toBeCalledWith(sqsMessage);
    expect(result).resolves;
  });
  it('Does not send webhook events to secondary queue', async () => {
    // Arrange
    process.env.SQS_SECONDARY_QUEUE = '';
    // Act
    await sendWebhookEventToSecondaryQueue(message);

    // Assert
    expect(mockSQS.sendMessage).not.toBeCalledWith(sqsMessage);
  });
});

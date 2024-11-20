import { SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { ActionRequestMessage, sendActionRequest } from '.';

const mockSQS = {
  sendMessage: jest.fn(() => {
    return {};
  }),
};
jest.mock('@aws-sdk/client-sqs', () => ({
  SQS: jest.fn().mockImplementation(() => mockSQS),
}));
jest.mock('@aws-github-runner/aws-ssm-util');

describe('Test sending message to SQS.', () => {
  const queueUrl = 'https://sqs.eu-west-1.amazonaws.com/123456789/queued-builds';
  const message = {
    eventType: 'type',
    id: 0,
    installationId: 0,
    repositoryName: 'test',
    repositoryOwner: 'owner',
    queueId: queueUrl,
    queueFifo: false,
    repoOwnerType: 'Organization',
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('no fifo queue', async () => {
    // Arrange
    const no_fifo_message: ActionRequestMessage = {
      ...message,
      queueFifo: false,
    };
    const sqsMessage: SendMessageCommandInput = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(no_fifo_message),
    };

    // Act
    const result = sendActionRequest(no_fifo_message);

    // Assert
    expect(mockSQS.sendMessage).toHaveBeenCalledWith(sqsMessage);
    await expect(result).resolves.not.toThrow();
  });

  it('use a fifo queue', async () => {
    // Arrange
    const fifo_message: ActionRequestMessage = {
      ...message,
      queueFifo: true,
    };
    const sqsMessage: SendMessageCommandInput = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(fifo_message),
    };
    // Act
    const result = sendActionRequest(fifo_message);

    // Assert
    expect(mockSQS.sendMessage).toHaveBeenCalledWith({ ...sqsMessage, MessageGroupId: String(message.id) });
    await expect(result).resolves.not.toThrow();
  });
});

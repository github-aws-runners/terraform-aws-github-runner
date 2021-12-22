import { SQS } from 'aws-sdk';
import { sendActionRequest, ActionRequestMessage } from '.';

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
    process.env.USE_FIFO_QUEUE = 'false';

    // Act
    const result = await sendActionRequest(message);

    // Assert
    expect(mockSQS.sendMessage).toBeCalledWith(sqsMessage);
    expect(result).resolves;
  });

  it('use a fifo queue', async () => {
    // Arrange
    process.env.SQS_URL_WEBHOOK = sqsMessage.QueueUrl;
    process.env.USE_FIFO_QUEUE = 'true';

    // Act
    const result = await sendActionRequest(message);

    // Assert
    expect(mockSQS.sendMessage).toBeCalledWith({ ...sqsMessage, MessageGroupId: String(message.id) });
    expect(result).resolves;
  });
});

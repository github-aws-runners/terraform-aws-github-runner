import { SQS } from 'aws-sdk';

import { ActionRequestMessage, sendActionRequest } from '.';

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
  const queueUrl = 'https://sqs.eu-west-1.amazonaws.com/123456789/queued-builds'
  const message = {
    eventType: 'type',
    id: 0,
    installationId: 0,
    repositoryName: 'test',
    repositoryOwner: 'owner',
    queueId: queueUrl
  };

  it('no fifo queue', async () => {
    // Arrange
    const no_fifo_message: ActionRequestMessage = {
      ...message,
      queueFifo: false
    };
    const sqsMessage: SQS.Types.SendMessageRequest = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(no_fifo_message),
    };
    // Act
    const result = await sendActionRequest(no_fifo_message);

    // Assert
    expect(mockSQS.sendMessage).toBeCalledWith(sqsMessage);
    expect(result).resolves;
  });

  it('use a fifo queue', async () => {
    // Arrange
    const fifo_message: ActionRequestMessage = {
      ...message,
      queueFifo: true
    };
    const sqsMessage: SQS.Types.SendMessageRequest = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(fifo_message),
    };
    // Act
    const result = await sendActionRequest(fifo_message);

    // Assert
    expect(mockSQS.sendMessage).toBeCalledWith({ ...sqsMessage, MessageGroupId: String(message.id) });
    expect(result).resolves;
  });
});

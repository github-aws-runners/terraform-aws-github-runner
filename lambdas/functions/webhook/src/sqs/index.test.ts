import { SendMessageCommandInput } from '@aws-sdk/client-sqs';
import { sendActionRequest } from '.';
import { describe, it, expect, afterEach, vi } from 'vitest';

const mockSQS = {
  sendMessage: vi.fn(() => {
    return {};
  }),
};
vi.mock('@aws-sdk/client-sqs', () => ({
  SQS: vi.fn().mockImplementation(() => mockSQS),
}));
vi.mock('@aws-github-runner/aws-ssm-util');

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
    vi.clearAllMocks();
  });

  it('no fifo queue', async () => {
    // Arrange
    const sqsMessage: SendMessageCommandInput = {
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
    };

    // Act
    const result = sendActionRequest(message);

    // Assert
    expect(mockSQS.sendMessage).toHaveBeenCalledWith(sqsMessage);
    await expect(result).resolves.not.toThrow();
  });
});

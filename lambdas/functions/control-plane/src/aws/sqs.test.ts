import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { publishMessage } from './sqs';
import { logger } from '@aws-github-runner/aws-powertools-util';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockSQSClient = mockClient(SQSClient);

describe('Publish message to SQS', () => {
  beforeEach(() => {
    mockSQSClient.reset();
  });

  it('should publish message to SQS', async () => {
    // setup
    mockSQSClient.on(SendMessageCommand).resolves({
      MessageId: '123',
    });

    // act
    await publishMessage('test', 'https://sqs.eu-west-1.amazonaws.com/123456789/queued-builds');

    // assert
    expect(mockSQSClient).toHaveReceivedCommandWith(SendMessageCommand, {
      QueueUrl: 'https://sqs.eu-west-1.amazonaws.com/123456789/queued-builds',
      MessageBody: 'test',
    });
  });

  it('should log error if queue URL not found', async () => {
    // setup
    const logErrorSpy = vi.spyOn(logger, 'error');

    // act
    await publishMessage('test', '');

    // assert
    expect(mockSQSClient).not.toHaveReceivedCommand(SendMessageCommand);
    expect(logErrorSpy).toHaveBeenCalled();
  });

  it('should log error if SQS send fails', async () => {
    // setup
    mockSQSClient.on(SendMessageCommand).rejects(new Error('failed'));
    const logErrorSpy = vi.spyOn(logger, 'error');

    // act
    await publishMessage('test', 'https://sqs.eu-west-1.amazonaws.com/123456789/queued-builds');

    // assert
    expect(mockSQSClient).toHaveReceivedCommandWith(SendMessageCommand, {
      QueueUrl: 'https://sqs.eu-west-1.amazonaws.com/123456789/queued-builds',
      MessageBody: 'test',
    });
    expect(logErrorSpy).toHaveBeenCalled();
  });
});

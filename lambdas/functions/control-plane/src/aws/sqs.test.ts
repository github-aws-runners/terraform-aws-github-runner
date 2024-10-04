import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { publishMessage } from './sqs';
import { logger } from '@aws-github-runner/aws-powertools-util';

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

  it('should publish message to SQS Fifo queue', async () => {
    // setup
    mockSQSClient.on(SendMessageCommand).resolves({
      MessageId: '123',
    });

    // act
    await publishMessage('test', 'https://sqs.eu-west-1.amazonaws.com/123456789/queued-builds.fifo');

    // assert
    expect(mockSQSClient).toHaveReceivedCommandWith(SendMessageCommand, {
      QueueUrl: 'https://sqs.eu-west-1.amazonaws.com/123456789/queued-builds.fifo',
      MessageBody: 'test',
      MessageGroupId: '1', // Fifo queue
    });
  });

  it('should log error if queue URL not found', async () => {
    // setup
    const logErrorSpy = jest.spyOn(logger, 'error');

    // act
    await publishMessage('test', '');

    // assert
    expect(mockSQSClient).not.toHaveReceivedCommand(SendMessageCommand);
    expect(logErrorSpy).toHaveBeenCalled();
  });

  it('should log error if SQS send fails', async () => {
    // setup
    mockSQSClient.on(SendMessageCommand).rejects(new Error('failed'));
    const logErrorSpy = jest.spyOn(logger, 'error');

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

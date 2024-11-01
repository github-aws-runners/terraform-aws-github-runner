import { EventBridgeClient, PutEventsCommandOutput, PutEventsRequestEntry } from '@aws-sdk/client-eventbridge';
import nock from 'nock';

import { publish } from '.';

jest.mock('@aws-sdk/client-eventbridge');

const cleanEnv = process.env;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  process.env = { ...cleanEnv };
  nock.disableNetConnect();
});

describe('Test EventBridge adapter', () => {
  test('Test publish without errors', async () => {
    // Arrange
    const output: PutEventsCommandOutput = {
      $metadata: {
        httpStatusCode: 200,
      },
      Entries: [],
      FailedEntryCount: 0,
    };

    EventBridgeClient.prototype.send = jest.fn().mockResolvedValue(output);

    // Act
    const result = await publish({
      EventBusName: 'test',
      Source: 'test',
      DetailType: 'test',
      Detail: 'test',
    } as PutEventsRequestEntry);

    // Assert
    expect(result).toBe(undefined);
  });

  test('Test publish with errors', async () => {
    // Arrange
    const output: PutEventsCommandOutput = {
      $metadata: {
        httpStatusCode: 200,
      },
      Entries: [],
      FailedEntryCount: 1,
    };

    EventBridgeClient.prototype.send = jest.fn().mockResolvedValue(output);

    await expect(
      publish({
        EventBusName: 'test',
        Source: 'test',
        DetailType: 'test',
        Detail: 'test',
      } as PutEventsRequestEntry),
    ).rejects.toThrowError('Event failed to send to EventBridge.');
  });

  test('Test publish with exceptions', async () => {
    // Arrange
    const error = new Error('test');
    EventBridgeClient.prototype.send = jest.fn().mockRejectedValue(error);

    await expect(
      publish({
        EventBusName: 'test',
        Source: 'test',
        DetailType: 'test',
        Detail: 'test',
      } as PutEventsRequestEntry),
    ).rejects.toThrow();
  });
});

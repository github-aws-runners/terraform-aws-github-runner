import { EventBridgeClient, PutEventsCommandOutput, PutEventsRequestEntry } from '@aws-sdk/client-eventbridge';
import nock from 'nock';

import { publish } from '.';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@aws-sdk/client-eventbridge');

const cleanEnv = process.env;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
  nock.disableNetConnect();
});

describe('Test EventBridge adapter', () => {
  it('Test publish without errors', async () => {
    // Arrange
    const output: PutEventsCommandOutput = {
      $metadata: {
        httpStatusCode: 200,
      },
      Entries: [],
      FailedEntryCount: 0,
    };

    EventBridgeClient.prototype.send = vi.fn().mockResolvedValue(output);

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

  it('Test publish with errors', async () => {
    // Arrange
    const output: PutEventsCommandOutput = {
      $metadata: {
        httpStatusCode: 200,
      },
      Entries: [],
      FailedEntryCount: 1,
    };

    EventBridgeClient.prototype.send = vi.fn().mockResolvedValue(output);

    await expect(
      publish({
        EventBusName: 'test',
        Source: 'test',
        DetailType: 'test',
        Detail: 'test',
      } as PutEventsRequestEntry),
    ).rejects.toThrowError('Event failed to send to EventBridge.');
  });

  it('Test publish with exceptions', async () => {
    // Arrange
    const error = new Error('test');
    EventBridgeClient.prototype.send = vi.fn().mockRejectedValue(error);

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

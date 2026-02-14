import { describe, expect, it } from 'vitest';
import type { ActionRequestMessageSQS } from './scale-up';
import ScaleError, { GHHttpError } from './ScaleError';

describe('ScaleError', () => {
  describe('detailedMessage', () => {
    it('should format message for single instance failure', () => {
      const error = new ScaleError(1);

      expect(error.detailedMessage).toBe(
        'Failed to create instance, create fleet failed. (Failed to create 1 instance)',
      );
    });

    it('should format message for multiple instance failures', () => {
      const error = new ScaleError(3);

      expect(error.detailedMessage).toBe(
        'Failed to create instance, create fleet failed. (Failed to create 3 instances)',
      );
    });
  });

  describe('toBatchItemFailures', () => {
    const mockMessages: ActionRequestMessageSQS[] = [
      { messageId: 'msg-1', id: 1, eventType: 'workflow_job' },
      { messageId: 'msg-2', id: 2, eventType: 'workflow_job' },
      { messageId: 'msg-3', id: 3, eventType: 'workflow_job' },
      { messageId: 'msg-4', id: 4, eventType: 'workflow_job' },
    ];

    it.each([
      { failedCount: 1, expected: [{ itemIdentifier: 'msg-1' }], description: 'default instance count' },
      {
        failedCount: 2,
        expected: [{ itemIdentifier: 'msg-1' }, { itemIdentifier: 'msg-2' }],
        description: 'less than message count',
      },
      {
        failedCount: 4,
        expected: [
          { itemIdentifier: 'msg-1' },
          { itemIdentifier: 'msg-2' },
          { itemIdentifier: 'msg-3' },
          { itemIdentifier: 'msg-4' },
        ],
        description: 'equal to message count',
      },
      {
        failedCount: 10,
        expected: [
          { itemIdentifier: 'msg-1' },
          { itemIdentifier: 'msg-2' },
          { itemIdentifier: 'msg-3' },
          { itemIdentifier: 'msg-4' },
        ],
        description: 'more than message count',
      },
      { failedCount: 0, expected: [], description: 'zero failed instances' },
      { failedCount: -1, expected: [], description: 'negative failed instances' },
      { failedCount: -10, expected: [], description: 'large negative failed instances' },
    ])('should handle $description (failedCount=$failedCount)', ({ failedCount, expected }) => {
      const error = new ScaleError(failedCount);
      const failures = error.toBatchItemFailures(mockMessages);

      expect(failures).toEqual(expected);
    });

    it('should handle empty message array', () => {
      const error = new ScaleError(3);
      const failures = error.toBatchItemFailures([]);

      expect(failures).toEqual([]);
    });
  });
});

describe('GHHttpError', () => {
  describe('constructor', () => {
    it('should set name, message, and status', () => {
      const error = new GHHttpError('Validation Failed', 422);

      expect(error.name).toBe('GHHttpError');
      expect(error.message).toBe('Validation Failed');
      expect(error.status).toBe(422);
    });

    it('should be an instance of ScaleError', () => {
      const error = new GHHttpError('Not Found', 404);

      expect(error).toBeInstanceOf(ScaleError);
      expect(error).toBeInstanceOf(GHHttpError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('detailedMessage', () => {
    it.each([
      { message: 'Validation Failed', status: 422, expected: 'GitHub API HTTP error (status 422): Validation Failed' },
      { message: 'Bad credentials', status: 401, expected: 'GitHub API HTTP error (status 401): Bad credentials' },
      { message: 'Not Found', status: 404, expected: 'GitHub API HTTP error (status 404): Not Found' },
      {
        message: 'Internal Server Error',
        status: 500,
        expected: 'GitHub API HTTP error (status 500): Internal Server Error',
      },
    ])('should format message for status $status', ({ message, status, expected }) => {
      const error = new GHHttpError(message, status);

      expect(error.detailedMessage).toBe(expected);
    });
  });

  describe('toBatchItemFailures', () => {
    const mockMessages: ActionRequestMessageSQS[] = [
      { messageId: 'msg-1', id: 1, eventType: 'workflow_job' },
      { messageId: 'msg-2', id: 2, eventType: 'workflow_job' },
      { messageId: 'msg-3', id: 3, eventType: 'workflow_job' },
    ];

    it('should retry ALL messages regardless of status', () => {
      const error = new GHHttpError('Validation Failed', 422);
      const failures = error.toBatchItemFailures(mockMessages);

      expect(failures).toEqual([{ itemIdentifier: 'msg-1' }, { itemIdentifier: 'msg-2' }, { itemIdentifier: 'msg-3' }]);
    });

    it('should retry the single message when only one is provided', () => {
      const error = new GHHttpError('Bad credentials', 401);
      const failures = error.toBatchItemFailures([mockMessages[0]]);

      expect(failures).toEqual([{ itemIdentifier: 'msg-1' }]);
    });

    it('should return empty array for empty messages', () => {
      const error = new GHHttpError('Server Error', 500);
      const failures = error.toBatchItemFailures([]);

      expect(failures).toEqual([]);
    });

    it('should retry all messages unlike ScaleError which retries only failedInstanceCount', () => {
      const messages: ActionRequestMessageSQS[] = [
        { messageId: 'msg-1', id: 1, eventType: 'workflow_job' },
        { messageId: 'msg-2', id: 2, eventType: 'workflow_job' },
        { messageId: 'msg-3', id: 3, eventType: 'workflow_job' },
        { messageId: 'msg-4', id: 4, eventType: 'workflow_job' },
        { messageId: 'msg-5', id: 5, eventType: 'workflow_job' },
      ];

      // ScaleError with failedInstanceCount=1 retries only 1 message
      const scaleError = new ScaleError(1);
      expect(scaleError.toBatchItemFailures(messages)).toHaveLength(1);

      // GHHttpError retries ALL messages
      const ghError = new GHHttpError('error', 422);
      expect(ghError.toBatchItemFailures(messages)).toHaveLength(5);
    });
  });
});

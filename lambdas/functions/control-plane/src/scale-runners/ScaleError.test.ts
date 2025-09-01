import { describe, expect, it } from 'vitest';
import type { ActionRequestMessageSQS } from './scale-up';
import ScaleError from './ScaleError';

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

import type { SQSBatchItemFailure } from 'aws-lambda';
import type { ActionRequestMessageSQS } from './scale-up';

class ScaleError extends Error {
  constructor(public readonly failedInstanceCount: number = 1) {
    super('Failed to create instance, create fleet failed.');
    this.name = 'ScaleError';
  }

  /**
   * Gets a formatted error message including the failed instance count
   */
  public get detailedMessage(): string {
    return `${this.message} (Failed to create ${this.failedInstanceCount} instance${this.failedInstanceCount !== 1 ? 's' : ''})`;
  }

  /**
   * Generate SQS batch item failures for the failed instances
   */
  public toBatchItemFailures(messages: ActionRequestMessageSQS[]): SQSBatchItemFailure[] {
    // Ensure we don't retry negative counts or more messages than available
    const messagesToRetry = Math.max(0, Math.min(this.failedInstanceCount, messages.length));
    return messages.slice(0, messagesToRetry).map(({ messageId }) => ({
      itemIdentifier: messageId,
    }));
  }
}

export default ScaleError;

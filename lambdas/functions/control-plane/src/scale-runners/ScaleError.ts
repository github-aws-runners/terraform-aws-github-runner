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

/**
 * Custom error for GitHub HTTP API failures during runner config creation.
 * Extends ScaleError so it is caught by the same handler in the Lambda entry point.
 *
 * Unlike a plain ScaleError (which retries only `failedInstanceCount` messages),
 * a GHHttpError retries ALL messages because the GitHub API failure may affect
 * every instance that was just launched.
 */
export class GHHttpError extends ScaleError {
  public readonly status: number;

  constructor(message: string, status: number) {
    super();
    this.message = message;
    this.name = 'GHHttpError';
    this.status = status;
  }

  public override get detailedMessage(): string {
    return `GitHub API HTTP error (status ${this.status}): ${this.message}`;
  }

  /**
   * Override: retry ALL messages because the GitHub API error affects the
   * entire batch of instances that were already created.
   */
  public override toBatchItemFailures(messages: ActionRequestMessageSQS[]): SQSBatchItemFailure[] {
    return messages.map(({ messageId }) => ({ itemIdentifier: messageId }));
  }
}

export default ScaleError;

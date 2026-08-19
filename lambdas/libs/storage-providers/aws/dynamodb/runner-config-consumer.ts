import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  type DeleteItemCommandOutput,
} from '@aws-sdk/client-dynamodb';

import type {
  AwsDynamoDbRunnerConfigStorageEnvironment,
  RunnerConfigConsumer,
  RunnerConfigConsumeOptions,
} from '../../core';
import {
  delay,
  isRetryableProviderError,
  resolvePollingOptions,
  throwIfCancelled,
  validateConsumeOptions,
  validateDynamoDbRunnerConfigKey,
  validateDynamoDbTableName,
  withCallDeadline,
  type RunnerConfigPollingOptions,
} from '../../runner-config-consumer-common';
import { EXPIRES_AT_ATTRIBUTE, ID_ATTRIBUTE, RUNNER_CONFIG_ID, SCOPE_ATTRIBUTE, VALUE_ATTRIBUTE } from './keys';

export interface AwsDynamoDbRunnerConfigApi {
  deleteItem(tableName: string, scope: string, signal: AbortSignal): Promise<string | undefined>;
}

export class AwsSdkDynamoDbRunnerConfigApi implements AwsDynamoDbRunnerConfigApi {
  private client?: DynamoDBClient;

  public constructor(client?: DynamoDBClient) {
    this.client = client;
  }

  private getClient(): DynamoDBClient {
    // Do not use the Lambda tracing wrapper here: lifecycle hooks run inside
    // the runner image and may be snapshotted before their first request.
    this.client ??= new DynamoDBClient({ maxAttempts: 1 });
    return this.client;
  }

  public async deleteItem(tableName: string, scope: string, signal: AbortSignal): Promise<string | undefined> {
    let response: DeleteItemCommandOutput;
    try {
      response = await this.getClient().send(
        new DeleteItemCommand({
          TableName: tableName,
          Key: {
            [SCOPE_ATTRIBUTE]: { S: scope },
            [ID_ATTRIBUTE]: { S: RUNNER_CONFIG_ID },
          },
          ConditionExpression: 'attribute_exists(#expires_at) AND #expires_at > :now',
          ExpressionAttributeNames: { '#expires_at': EXPIRES_AT_ATTRIBUTE },
          ExpressionAttributeValues: { ':now': { N: Math.floor(Date.now() / 1_000).toString() } },
          ReturnValues: 'ALL_OLD',
        }),
        { abortSignal: signal },
      );
    } catch (error) {
      if (
        error instanceof ConditionalCheckFailedException ||
        (error !== null &&
          typeof error === 'object' &&
          'name' in error &&
          error.name === 'ConditionalCheckFailedException')
      ) {
        return undefined;
      }
      throw error;
    }
    if (response.Attributes === undefined) {
      return undefined;
    }
    const value = response.Attributes[VALUE_ATTRIBUTE];
    if (value?.S === undefined || value.S.length === 0) {
      throw new Error('runner configuration record has an invalid value');
    }
    return value.S;
  }
}

export interface AwsDynamoDbRunnerConfigConsumerOptions extends RunnerConfigPollingOptions {
  api?: AwsDynamoDbRunnerConfigApi;
}

export function createAwsDynamoDbRunnerConfigConsumer(
  environment: AwsDynamoDbRunnerConfigStorageEnvironment,
  options: AwsDynamoDbRunnerConfigConsumerOptions = {},
): RunnerConfigConsumer {
  return new AwsDynamoDbRunnerConfigConsumer(
    environment.RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME,
    options.api ?? new AwsSdkDynamoDbRunnerConfigApi(),
    options,
  );
}

class AwsDynamoDbRunnerConfigConsumer implements RunnerConfigConsumer {
  private readonly callTimeoutMs: number;
  private readonly configTimeoutMs: number;
  private readonly pollIntervalMs: number;

  public constructor(
    private readonly tableName: string,
    private readonly api: AwsDynamoDbRunnerConfigApi,
    options: AwsDynamoDbRunnerConfigConsumerOptions,
  ) {
    const polling = resolvePollingOptions(options);
    this.callTimeoutMs = polling.callTimeoutMs;
    this.configTimeoutMs = polling.configTimeoutMs;
    this.pollIntervalMs = polling.pollIntervalMs;
  }

  public async consume(runnerId: string, options: RunnerConfigConsumeOptions): Promise<string> {
    validateConsumeOptions(options);
    const tableName = validateDynamoDbTableName(this.tableName);
    validateDynamoDbRunnerConfigKey(runnerId, RUNNER_CONFIG_ID);
    const pollDeadline = Math.min(Date.now() + this.configTimeoutMs, options.deadlineMs);

    while (Date.now() < pollDeadline) {
      throwIfCancelled(options.signal);
      try {
        const runnerConfig = await withCallDeadline(options.signal, pollDeadline, this.callTimeoutMs, (callSignal) =>
          this.api.deleteItem(tableName, runnerId, callSignal),
        );
        if (runnerConfig !== undefined) {
          return runnerConfig;
        }
      } catch (error) {
        if (options.signal.aborted) {
          throw new Error('runner configuration consumption was cancelled');
        }
        if (!isRetryableProviderError(error)) {
          throw new Error('failed to consume runner configuration from DynamoDB');
        }
      }

      const remaining = pollDeadline - Date.now();
      if (remaining > 0) {
        await delay(Math.min(this.pollIntervalMs, remaining), options.signal);
      }
    }

    throw new Error('runner configuration did not become available before the deadline');
  }
}

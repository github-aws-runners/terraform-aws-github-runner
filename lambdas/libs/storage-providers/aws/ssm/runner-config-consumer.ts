import { DeleteParameterCommand, GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

import type { RunnerConfigConsumer, RunnerConfigConsumeOptions } from '../../core';
import {
  composeSsmParameterName,
  delay,
  errorName,
  isRetryableProviderError,
  positiveIntegerOption,
  resolvePollingOptions,
  throwIfCancelled,
  validateConsumeOptions,
  withCallDeadline,
  type RunnerConfigPollingOptions,
} from './runner-config-consumer-common';
import { createAwsSsmStorageLogger, getErrorNames } from './logger';

const DEFAULT_DELETE_ATTEMPTS = 3;
const logger = createAwsSsmStorageLogger('runner-config-consumer');

export interface AwsSsmRunnerConfigApi {
  getParameter(name: string, signal: AbortSignal): Promise<string | undefined>;
  deleteParameter(name: string, signal: AbortSignal): Promise<void>;
}

export class AwsSdkSsmRunnerConfigApi implements AwsSsmRunnerConfigApi {
  private client?: SSMClient;

  public constructor(client?: SSMClient) {
    this.client = client;
  }

  private getClient(): SSMClient {
    // Lifecycle hooks can be snapshotted before their first request. Constructing
    // the untraced client here avoids persisting connection state in that snapshot.
    this.client ??= new SSMClient({ maxAttempts: 1 });
    return this.client;
  }

  public async getParameter(name: string, signal: AbortSignal): Promise<string | undefined> {
    const response = await this.getClient().send(new GetParameterCommand({ Name: name, WithDecryption: true }), {
      abortSignal: signal,
    });
    return response.Parameter?.Value;
  }

  public async deleteParameter(name: string, signal: AbortSignal): Promise<void> {
    await this.getClient().send(new DeleteParameterCommand({ Name: name }), { abortSignal: signal });
  }
}

export interface AwsSsmRunnerConfigConsumerOptions extends RunnerConfigPollingOptions {
  api?: AwsSsmRunnerConfigApi;
  deleteAttempts?: number;
}

export function createAwsSsmRunnerConfigConsumer(
  environment: { SSM_TOKEN_PATH: string },
  options: AwsSsmRunnerConfigConsumerOptions = {},
): RunnerConfigConsumer {
  return new AwsSsmRunnerConfigConsumer(
    environment.SSM_TOKEN_PATH,
    options.api ?? new AwsSdkSsmRunnerConfigApi(),
    options,
  );
}

class AwsSsmRunnerConfigConsumer implements RunnerConfigConsumer {
  private readonly callTimeoutMs: number;
  private readonly configTimeoutMs: number;
  private readonly deleteAttempts: number;
  private readonly pollIntervalMs: number;

  public constructor(
    private readonly tokenPath: string,
    private readonly api: AwsSsmRunnerConfigApi,
    options: AwsSsmRunnerConfigConsumerOptions,
  ) {
    const polling = resolvePollingOptions(options);
    this.callTimeoutMs = polling.callTimeoutMs;
    this.configTimeoutMs = polling.configTimeoutMs;
    this.pollIntervalMs = polling.pollIntervalMs;
    this.deleteAttempts = positiveIntegerOption('deleteAttempts', options.deleteAttempts, DEFAULT_DELETE_ATTEMPTS);
  }

  public async consume(runnerId: string, options: RunnerConfigConsumeOptions): Promise<string> {
    validateConsumeOptions(options);
    const parameterName = composeSsmParameterName(this.tokenPath, runnerId);
    const startedAt = Date.now();
    const remainingMs = Math.max(0, options.deadlineMs - startedAt);
    // Preserve enough of short hook budgets for at least one bounded delete
    // attempt without reviving the old fixed reserve that could consume the
    // entire polling window.
    const deleteReserveMs = Math.min(this.callTimeoutMs, Math.max(1, Math.floor(remainingMs / 2)));
    const pollDeadline = Math.min(startedAt + this.configTimeoutMs, options.deadlineMs - deleteReserveMs);
    let runnerConfig: string | undefined;
    let pollAttempt = 0;

    logger.debug('Waiting for runner configuration', {
      runnerId,
      parameterName,
      callTimeoutMs: this.callTimeoutMs,
      pollDeadline,
      pollIntervalMs: this.pollIntervalMs,
    });

    while (Date.now() < pollDeadline) {
      throwIfCancelled(options.signal);
      pollAttempt += 1;
      try {
        runnerConfig = await this.read(parameterName, pollDeadline, options.signal);
        if (runnerConfig !== undefined) {
          if (runnerConfig.length === 0) {
            throw new Error('runner configuration record has an invalid value');
          }
          break;
        }
      } catch (error) {
        if (options.signal.aborted) {
          throw new Error('runner configuration consumption was cancelled', { cause: error });
        }
        if (!isSsmNotFound(error) && !isRetryableProviderError(error)) {
          logger.error('Failed to read runner configuration', {
            runnerId,
            parameterName,
            pollAttempt,
            errorNames: getErrorNames(error),
          });
          throw new Error('failed to read runner configuration from SSM', { cause: error });
        }
        logger.debug('Runner configuration is not available; polling will continue', {
          runnerId,
          parameterName,
          pollAttempt,
          errorNames: getErrorNames(error),
        });
      }

      const remaining = pollDeadline - Date.now();
      if (remaining > 0) {
        await delay(Math.min(this.pollIntervalMs, remaining), options.signal);
      }
    }

    if (runnerConfig === undefined) {
      logger.warn('Runner configuration did not become available before the deadline', {
        runnerId,
        parameterName,
        pollAttempts: pollAttempt,
        pollDeadline,
      });
      throw new Error('runner configuration did not become available before the deadline');
    }

    logger.debug('Runner configuration became available', {
      runnerId,
      parameterName,
      pollAttempts: pollAttempt,
    });
    await this.delete(parameterName, runnerId, options);
    return runnerConfig;
  }

  private async read(name: string, deadlineMs: number, signal: AbortSignal): Promise<string | undefined> {
    return withCallDeadline(signal, deadlineMs, this.callTimeoutMs, (callSignal) =>
      this.api.getParameter(name, callSignal),
    );
  }

  private async delete(name: string, runnerId: string, options: RunnerConfigConsumeOptions): Promise<void> {
    let lastError: unknown;
    let attemptedDeletes = 0;
    for (let attempt = 1; attempt <= this.deleteAttempts; attempt += 1) {
      attemptedDeletes = attempt;
      try {
        await withCallDeadline(options.signal, options.deadlineMs, this.callTimeoutMs, (callSignal) =>
          this.api.deleteParameter(name, callSignal),
        );
        logger.debug('Deleted consumed runner configuration', {
          runnerId,
          parameterName: name,
          deleteAttempt: attempt,
        });
        return;
      } catch (error) {
        lastError = error;
        if (options.signal.aborted) {
          throw new Error('runner configuration consumption was cancelled', { cause: error });
        }
        if (!isRetryableProviderError(error) || attempt === this.deleteAttempts) {
          break;
        }

        const remaining = options.deadlineMs - Date.now();
        if (remaining <= 0) {
          break;
        }
        logger.debug('Runner configuration deletion failed; retrying', {
          runnerId,
          parameterName: name,
          deleteAttempt: attempt,
          errorNames: getErrorNames(error),
        });
        await delay(Math.min(2 ** (attempt - 1) * 1_000, 5_000, remaining), options.signal);
      }
    }
    logger.error('Failed to delete consumed runner configuration', {
      runnerId,
      parameterName: name,
      deleteAttempts: attemptedDeletes,
      errorNames: getErrorNames(lastError),
    });
    throw new Error('runner configuration could not be deleted from SSM', { cause: lastError });
  }
}

function isSsmNotFound(error: unknown): boolean {
  return errorName(error) === 'ParameterNotFound';
}

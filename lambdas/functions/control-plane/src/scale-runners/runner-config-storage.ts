import { Agent as HttpsAgent, type AgentOptions as HttpsAgentOptions } from 'https';

import { createChildLogger, getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';
import { getParameter, putParameter } from '@aws-github-runner/aws-ssm-util';
import { DynamoDBClient, GetItemCommand, PutItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import type { CreateGitHubRunnerConfig, RunnerConfigStorage, RunnerConfigStorageBackend } from './types';

const logger = createChildLogger('runner-config-storage');
const DEFAULT_DYNAMODB_PARTITION_KEY_NAME = 'id';
const DEFAULT_DYNAMODB_VALUE_ATTRIBUTE_NAME = 'value';
const DEFAULT_DYNAMODB_CONFIG_KEY_PREFIX = 'config#';
const DEFAULT_DYNAMODB_CONSISTENT_READ = true;
const DEFAULT_DYNAMODB_TOKEN_OVERWRITE_PROTECTION_ENABLED = true;
const DEFAULT_DYNAMODB_TTL_ATTRIBUTE_NAME = 'expires_at';
const DEFAULT_DYNAMODB_CLIENT_MAX_ATTEMPTS = 10;
const DEFAULT_DYNAMODB_CLIENT_RETRY_MODE = 'adaptive';
const DEFAULT_DYNAMODB_CLIENT_HTTP_KEEP_ALIVE = true;
const DEFAULT_DYNAMODB_CLIENT_HTTP_MAX_SOCKETS = 50;

export interface RunnerConfigStore {
  backend: RunnerConfigStorageBackend;
  delayWritesForSsmThroughput: boolean;
  getConfigValue(key: string): Promise<string | undefined>;
  putConfigValue(key: string, value: string, options?: RunnerConfigStorePutOptions): Promise<void>;
  putRunnerConfig(runnerId: string, value: string, options?: RunnerConfigStorePutOptions): Promise<void>;
}

export interface RunnerConfigStorePutOptions {
  tags?: { Key: string; Value: string }[];
}

type DynamoDbStorageConfig = NonNullable<RunnerConfigStorage['dynamodb']>;

interface DynamoDbRunnerConfigStoreConfig {
  tableName: string;
  partitionKeyName: string;
  valueAttributeName: string;
  configKeyPrefix: string;
  consistentRead: boolean;
  tokenOverwriteProtectionEnabled: boolean;
  tokenKeyPrefix: string;
  tokenTtlSeconds: number;
  ttlAttributeName: string;
}

interface DynamoDbClientConfig {
  maxAttempts: number;
  retryMode: 'standard' | 'adaptive';
  httpKeepAlive: boolean;
  httpMaxSockets: number;
  httpKeepAliveMsecs?: number;
}

let memoisedDynamoDbClient: DynamoDBClient | undefined;

export function dynamoDbClient(): DynamoDBClient {
  if (memoisedDynamoDbClient) {
    return memoisedDynamoDbClient;
  }

  const clientConfig = loadDynamoDbClientConfigFromEnv();
  const httpsAgentOptions: HttpsAgentOptions = {
    keepAlive: clientConfig.httpKeepAlive,
    maxSockets: clientConfig.httpMaxSockets,
  };

  if (clientConfig.httpKeepAliveMsecs !== undefined) {
    httpsAgentOptions.keepAliveMsecs = clientConfig.httpKeepAliveMsecs;
  }

  memoisedDynamoDbClient = getTracedAWSV3Client(
    new DynamoDBClient({
      region: process.env.AWS_REGION,
      maxAttempts: clientConfig.maxAttempts,
      retryMode: clientConfig.retryMode,
      requestHandler: new NodeHttpHandler({
        httpsAgent: new HttpsAgent(httpsAgentOptions),
      }),
    }),
  );

  return memoisedDynamoDbClient;
}

export function resetDynamoDbClient(): void {
  memoisedDynamoDbClient = undefined;
}

export function loadRunnerConfigStorageFromEnv(): RunnerConfigStorage {
  const backend = parseBackend(process.env.RUNNER_CONFIG_STORAGE_BACKEND);

  if (backend === 'ssm') {
    return { backend };
  }

  const tableName = requireEnv('RUNNER_CONFIG_DYNAMODB_TABLE_NAME');
  const tokenKeyPrefix = requireEnv('RUNNER_CONFIG_DYNAMODB_TOKEN_KEY_PREFIX');
  const tokenTtlSeconds = parsePositiveInteger(
    process.env.RUNNER_CONFIG_DYNAMODB_TTL_SECONDS,
    undefined,
    'RUNNER_CONFIG_DYNAMODB_TTL_SECONDS',
  );

  return {
    backend,
    dynamodb: {
      tableName,
      partitionKeyName: parseNonEmptyString(
        process.env.RUNNER_CONFIG_DYNAMODB_PARTITION_KEY_NAME,
        DEFAULT_DYNAMODB_PARTITION_KEY_NAME,
        'RUNNER_CONFIG_DYNAMODB_PARTITION_KEY_NAME',
      ),
      valueAttributeName: parseNonEmptyString(
        process.env.RUNNER_CONFIG_DYNAMODB_VALUE_ATTRIBUTE_NAME,
        DEFAULT_DYNAMODB_VALUE_ATTRIBUTE_NAME,
        'RUNNER_CONFIG_DYNAMODB_VALUE_ATTRIBUTE_NAME',
      ),
      configKeyPrefix: parseNonEmptyString(
        process.env.RUNNER_CONFIG_DYNAMODB_CONFIG_KEY_PREFIX,
        DEFAULT_DYNAMODB_CONFIG_KEY_PREFIX,
        'RUNNER_CONFIG_DYNAMODB_CONFIG_KEY_PREFIX',
      ),
      consistentRead: parseBoolean(
        process.env.RUNNER_CONFIG_DYNAMODB_CONSISTENT_READ,
        DEFAULT_DYNAMODB_CONSISTENT_READ,
        'RUNNER_CONFIG_DYNAMODB_CONSISTENT_READ',
      ),
      tokenOverwriteProtectionEnabled: parseBoolean(
        process.env.RUNNER_CONFIG_DYNAMODB_TOKEN_OVERWRITE_PROTECTION_ENABLED,
        DEFAULT_DYNAMODB_TOKEN_OVERWRITE_PROTECTION_ENABLED,
        'RUNNER_CONFIG_DYNAMODB_TOKEN_OVERWRITE_PROTECTION_ENABLED',
      ),
      tokenKeyPrefix,
      tokenTtlSeconds,
      ttlAttributeName: parseNonEmptyString(
        process.env.RUNNER_CONFIG_DYNAMODB_TTL_ATTRIBUTE_NAME,
        DEFAULT_DYNAMODB_TTL_ATTRIBUTE_NAME,
        'RUNNER_CONFIG_DYNAMODB_TTL_ATTRIBUTE_NAME',
      ),
    },
  };
}

export function createRunnerConfigStore(githubRunnerConfig: CreateGitHubRunnerConfig): RunnerConfigStore {
  const storage = githubRunnerConfig.runnerConfigStorage ?? { backend: 'ssm' };

  if (storage.backend === 'ssm') {
    return new SsmRunnerConfigStore(githubRunnerConfig.ssmConfigPath, githubRunnerConfig.ssmTokenPath);
  }

  if (!storage.dynamodb) {
    throw new Error('DynamoDB runner config storage requires tableName, tokenKeyPrefix, and tokenTtlSeconds');
  }

  return new DynamoDbRunnerConfigStore(storage.dynamodb);
}

function loadDynamoDbClientConfigFromEnv(): DynamoDbClientConfig {
  return {
    maxAttempts: parsePositiveInteger(
      process.env.RUNNER_CONFIG_DYNAMODB_CLIENT_MAX_ATTEMPTS,
      DEFAULT_DYNAMODB_CLIENT_MAX_ATTEMPTS,
      'RUNNER_CONFIG_DYNAMODB_CLIENT_MAX_ATTEMPTS',
    ),
    retryMode: parseRetryMode(process.env.RUNNER_CONFIG_DYNAMODB_CLIENT_RETRY_MODE),
    httpKeepAlive: parseBoolean(
      process.env.RUNNER_CONFIG_DYNAMODB_CLIENT_HTTP_KEEP_ALIVE,
      DEFAULT_DYNAMODB_CLIENT_HTTP_KEEP_ALIVE,
      'RUNNER_CONFIG_DYNAMODB_CLIENT_HTTP_KEEP_ALIVE',
    ),
    httpMaxSockets: parsePositiveInteger(
      process.env.RUNNER_CONFIG_DYNAMODB_CLIENT_HTTP_MAX_SOCKETS,
      DEFAULT_DYNAMODB_CLIENT_HTTP_MAX_SOCKETS,
      'RUNNER_CONFIG_DYNAMODB_CLIENT_HTTP_MAX_SOCKETS',
    ),
    httpKeepAliveMsecs: parseOptionalNonNegativeInteger(
      process.env.RUNNER_CONFIG_DYNAMODB_CLIENT_HTTP_KEEP_ALIVE_MSECS,
      'RUNNER_CONFIG_DYNAMODB_CLIENT_HTTP_KEEP_ALIVE_MSECS',
    ),
  };
}

function parseBackend(value: string | undefined): RunnerConfigStorageBackend {
  const backend = (value ?? 'ssm').toLowerCase();
  if (backend === 'ssm' || backend === 'dynamodb') {
    return backend;
  }

  throw new Error(`Unsupported RUNNER_CONFIG_STORAGE_BACKEND '${value}'`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`${name} must be set when RUNNER_CONFIG_STORAGE_BACKEND is 'dynamodb'`);
  }
  return value;
}

function parseNonEmptyString(value: string | undefined, defaultValue: string, name: string): string {
  if (value === undefined) {
    return defaultValue;
  }

  if (value.trim() === '') {
    throw new Error(`${name} must not be empty`);
  }

  return value;
}

function parsePositiveInteger(value: string | undefined, defaultValue: number | undefined, name: string): number {
  if (!value || value.trim() === '') {
    if (defaultValue === undefined) {
      throw new Error(`${name} must be set and be a positive integer`);
    }

    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseOptionalNonNegativeInteger(value: string | undefined, name: string): number | undefined {
  if (!value || value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

function parseBoolean(value: string | undefined, defaultValue: boolean, name: string): boolean {
  if (!value || value.trim() === '') {
    return defaultValue;
  }

  const normalised = value.trim().toLowerCase();
  if (normalised === 'true') {
    return true;
  }
  if (normalised === 'false') {
    return false;
  }

  throw new Error(`${name} must be either 'true' or 'false'`);
}

function parseRetryMode(value: string | undefined): 'standard' | 'adaptive' {
  const retryMode = value?.trim() ?? DEFAULT_DYNAMODB_CLIENT_RETRY_MODE;
  if (retryMode === 'standard' || retryMode === 'adaptive') {
    return retryMode;
  }

  throw new Error(`RUNNER_CONFIG_DYNAMODB_CLIENT_RETRY_MODE must be either 'standard' or 'adaptive'`);
}

function normaliseDynamoDbConfig(config: DynamoDbStorageConfig): DynamoDbRunnerConfigStoreConfig {
  return {
    tableName: config.tableName,
    partitionKeyName: config.partitionKeyName ?? DEFAULT_DYNAMODB_PARTITION_KEY_NAME,
    valueAttributeName: config.valueAttributeName ?? DEFAULT_DYNAMODB_VALUE_ATTRIBUTE_NAME,
    configKeyPrefix: config.configKeyPrefix ?? DEFAULT_DYNAMODB_CONFIG_KEY_PREFIX,
    consistentRead: config.consistentRead ?? DEFAULT_DYNAMODB_CONSISTENT_READ,
    tokenOverwriteProtectionEnabled:
      config.tokenOverwriteProtectionEnabled ?? DEFAULT_DYNAMODB_TOKEN_OVERWRITE_PROTECTION_ENABLED,
    tokenKeyPrefix: config.tokenKeyPrefix,
    tokenTtlSeconds: config.tokenTtlSeconds,
    ttlAttributeName: config.ttlAttributeName ?? DEFAULT_DYNAMODB_TTL_ATTRIBUTE_NAME,
  };
}

class SsmRunnerConfigStore implements RunnerConfigStore {
  readonly backend = 'ssm';
  readonly delayWritesForSsmThroughput = true;

  constructor(
    private readonly configPath: string,
    private readonly tokenPath: string,
  ) {}

  async getConfigValue(key: string): Promise<string | undefined> {
    return await getParameter(`${this.configPath}/${key}`);
  }

  async putConfigValue(key: string, value: string, options: RunnerConfigStorePutOptions = {}): Promise<void> {
    await putParameter(`${this.configPath}/${key}`, value, false, {
      tags: options.tags,
    });
  }

  async putRunnerConfig(runnerId: string, value: string, options: RunnerConfigStorePutOptions = {}): Promise<void> {
    await putParameter(`${this.tokenPath}/${runnerId}`, value, true, {
      tags: options.tags,
    });
  }
}

class DynamoDbRunnerConfigStore implements RunnerConfigStore {
  readonly backend = 'dynamodb';
  readonly delayWritesForSsmThroughput = false;
  private readonly config: DynamoDbRunnerConfigStoreConfig;

  constructor(config: DynamoDbStorageConfig) {
    this.config = normaliseDynamoDbConfig(config);
  }

  async getConfigValue(key: string): Promise<string | undefined> {
    return await this.getValue(`${this.config.configKeyPrefix}${key}`);
  }

  async putConfigValue(key: string, value: string): Promise<void> {
    await this.putValue(`${this.config.configKeyPrefix}${key}`, value);
  }

  async putRunnerConfig(runnerId: string, value: string): Promise<void> {
    await this.putValue(
      `${this.config.tokenKeyPrefix}${runnerId}`,
      value,
      this.config.tokenOverwriteProtectionEnabled
        ? {
            conditionExpression: 'attribute_not_exists(#partition_key)',
            expressionAttributeNames: {
              '#partition_key': this.config.partitionKeyName,
            },
            ttlSeconds: this.config.tokenTtlSeconds,
          }
        : {
            ttlSeconds: this.config.tokenTtlSeconds,
          },
    );
  }

  private async getValue(id: string): Promise<string | undefined> {
    const result = await dynamoDbClient().send(
      new GetItemCommand({
        TableName: this.config.tableName,
        Key: {
          [this.config.partitionKeyName]: { S: id },
        },
        ConsistentRead: this.config.consistentRead,
        ProjectionExpression: '#value',
        ExpressionAttributeNames: {
          '#value': this.config.valueAttributeName,
        },
      }),
    );

    return result.Item?.[this.config.valueAttributeName]?.S;
  }

  private async putValue(
    id: string,
    value: string,
    options: {
      conditionExpression?: string;
      expressionAttributeNames?: Record<string, string>;
      ttlSeconds?: number;
    } = {},
  ): Promise<void> {
    const item: Record<string, AttributeValue> = {
      [this.config.partitionKeyName]: { S: id },
      [this.config.valueAttributeName]: { S: value },
    };

    if (options.ttlSeconds) {
      const expiresAt = Math.floor(Date.now() / 1000) + options.ttlSeconds;
      item[this.config.ttlAttributeName] = { N: expiresAt.toString() };
    }

    logger.debug('Writing runner config value to DynamoDB', {
      tableName: this.config.tableName,
      id,
      hasTtl: options.ttlSeconds !== undefined,
    });

    await dynamoDbClient().send(
      new PutItemCommand({
        TableName: this.config.tableName,
        Item: item,
        ConditionExpression: options.conditionExpression,
        ExpressionAttributeNames: options.expressionAttributeNames,
      }),
    );
  }
}

import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';

import type {
  CreateRunnerStateRecord,
  RunnerConfigMetadata,
  RunnerGitHubIdentity,
  RunnerLifecycleState,
  RunnerStateActivation,
  RunnerStateFilter,
  RunnerStateRecord,
  RunnerStateStore,
  RunnerType,
} from '../../core';
import { getDynamoDbClient } from './client';
import { positiveIntegerEnvironmentValue, requiredEnvironmentValue } from './environment';
import { EXPIRES_AT_ATTRIBUTE, ID_ATTRIBUTE, runnerStateId, runnerStateScope, SCOPE_ATTRIBUTE } from './keys';

const RUNNER_ID_PREFIX = 'runner#';
const RUNNER_ID_ATTRIBUTE = 'runner_id';
const COMPUTE_PROVIDER_ATTRIBUTE = 'compute_provider';
const COMPUTE_RESOURCE_ID_ATTRIBUTE = 'compute_resource_id';
const RUNNER_NAME_ATTRIBUTE = 'runner_name';
const RUNNER_LABELS_ATTRIBUTE = 'runner_labels';
const GITHUB_RUNNER_ID_ATTRIBUTE = 'github_runner_id';
const RUNNER_OWNER_ATTRIBUTE = 'runner_owner';
const RUNNER_TYPE_ATTRIBUTE = 'runner_type';
const STATE_ATTRIBUTE = 'state';
const CREATED_AT_ATTRIBUTE = 'created_at';
const UPDATED_AT_ATTRIBUTE = 'updated_at';
const METADATA_ATTRIBUTE = 'metadata';
// AWS Lambda can run for at most 15 minutes. One extra minute prevents a second
// invocation from reclaiming a termination while the original can still be running.
const TERMINATION_CLAIM_LEASE_MILLISECONDS = 16 * 60 * 1000;

interface AwsDynamoDbRunnerStateStoreConfig {
  tableName: string;
  scope: string;
  ttlSeconds: number;
}

export function createAwsDynamoDbRunnerStateStore(): RunnerStateStore {
  return new AwsDynamoDbRunnerStateStore({
    tableName: requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME'),
    scope: runnerStateScope(requiredEnvironmentValue('RUNNER_CONFIG_DYNAMODB_ENTRY_ID')),
    ttlSeconds: positiveIntegerEnvironmentValue('RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TTL_SECONDS'),
  });
}

class AwsDynamoDbRunnerStateStore implements RunnerStateStore {
  constructor(private readonly config: AwsDynamoDbRunnerStateStoreConfig) {}

  async create(record: CreateRunnerStateRecord): Promise<void> {
    validateCreateRecord(record);
    const now = new Date();
    const timestamp = now.toISOString();
    const item: Record<string, AttributeValue> = {
      [SCOPE_ATTRIBUTE]: { S: this.config.scope },
      [ID_ATTRIBUTE]: { S: runnerStateId(record.runnerId) },
      [RUNNER_ID_ATTRIBUTE]: { S: record.runnerId },
      [COMPUTE_PROVIDER_ATTRIBUTE]: { S: record.computeProvider },
      [COMPUTE_RESOURCE_ID_ATTRIBUTE]: { S: record.computeResourceId },
      [RUNNER_OWNER_ATTRIBUTE]: { S: record.runnerOwner },
      [RUNNER_TYPE_ATTRIBUTE]: { S: record.runnerType },
      [STATE_ATTRIBUTE]: { S: 'provisioning' },
      [CREATED_AT_ATTRIBUTE]: { S: timestamp },
      [UPDATED_AT_ATTRIBUTE]: { S: timestamp },
      [EXPIRES_AT_ATTRIBUTE]: { N: expiresAt(now, this.config.ttlSeconds) },
    };

    setOptionalString(item, RUNNER_NAME_ATTRIBUTE, record.runnerName);
    setOptionalStringList(item, RUNNER_LABELS_ATTRIBUTE, record.runnerLabels);
    setMetadata(item, record.metadata);

    await getDynamoDbClient().send(
      new PutItemCommand({
        TableName: this.config.tableName,
        Item: item,
        ConditionExpression: 'attribute_not_exists(#scope) AND attribute_not_exists(#id)',
        ExpressionAttributeNames: {
          '#scope': SCOPE_ATTRIBUTE,
          '#id': ID_ATTRIBUTE,
        },
      }),
    );
  }

  async activate(runnerId: string, activation: RunnerStateActivation = {}): Promise<void> {
    validateNonEmptyString(runnerId, 'runnerId');
    validateActivation(activation);
    await this.transition(runnerId, ['provisioning'], 'active', activation);
  }

  async recordGitHubIdentity(runnerId: string, identity: RunnerGitHubIdentity): Promise<void> {
    validateNonEmptyString(identity.githubRunnerId, 'githubRunnerId');
    validateActivation(identity);
    await this.transition(runnerId, ['provisioning'], 'provisioning', identity);
  }

  async list(filter: RunnerStateFilter = {}): Promise<RunnerStateRecord[]> {
    if (filter.computeProvider !== undefined) {
      validateNonEmptyString(filter.computeProvider, 'computeProvider');
    }

    const records: RunnerStateRecord[] = [];
    let exclusiveStartKey: Record<string, AttributeValue> | undefined;

    do {
      const expressionAttributeNames: Record<string, string> = {
        '#scope': SCOPE_ATTRIBUTE,
        '#id': ID_ATTRIBUTE,
      };
      const expressionAttributeValues: Record<string, AttributeValue> = {
        ':scope': { S: this.config.scope },
        ':runner': { S: RUNNER_ID_PREFIX },
      };

      if (filter.computeProvider !== undefined) {
        expressionAttributeNames['#computeProvider'] = COMPUTE_PROVIDER_ATTRIBUTE;
        expressionAttributeValues[':computeProvider'] = { S: filter.computeProvider };
      }

      const result = await getDynamoDbClient().send(
        new QueryCommand({
          TableName: this.config.tableName,
          KeyConditionExpression: '#scope = :scope AND begins_with(#id, :runner)',
          FilterExpression: filter.computeProvider === undefined ? undefined : '#computeProvider = :computeProvider',
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
          ConsistentRead: true,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      for (const item of result.Items ?? []) {
        records.push(parseRunnerStateRecord(item, this.config.scope));
      }
      exclusiveStartKey = result.LastEvaluatedKey;
    } while (exclusiveStartKey !== undefined);

    return records;
  }

  async markOrphan(runnerId: string): Promise<void> {
    await this.transition(runnerId, ['active'], 'orphan');
  }

  async unmarkOrphan(runnerId: string): Promise<void> {
    await this.transition(runnerId, ['orphan'], 'active');
  }

  async beginTermination(runnerId: string): Promise<RunnerLifecycleState | undefined> {
    validateNonEmptyString(runnerId, 'runnerId');
    const now = new Date();
    const staleBefore = new Date(now.getTime() - TERMINATION_CLAIM_LEASE_MILLISECONDS).toISOString();
    try {
      const previous = (
        await getDynamoDbClient().send(
          new UpdateItemCommand({
            TableName: this.config.tableName,
            Key: this.key(runnerId),
            UpdateExpression: 'SET #state = :terminating, #updatedAt = :updatedAt, #expiresAt = :expiresAt',
            ConditionExpression:
              'attribute_exists(#scope) AND attribute_exists(#id) AND (#state IN (:provisioning, :active, :orphan) OR (#state = :terminating AND #updatedAt < :staleBefore))',
            ExpressionAttributeNames: {
              '#scope': SCOPE_ATTRIBUTE,
              '#id': ID_ATTRIBUTE,
              '#state': STATE_ATTRIBUTE,
              '#updatedAt': UPDATED_AT_ATTRIBUTE,
              '#expiresAt': EXPIRES_AT_ATTRIBUTE,
            },
            ExpressionAttributeValues: {
              ':provisioning': { S: 'provisioning' },
              ':active': { S: 'active' },
              ':orphan': { S: 'orphan' },
              ':terminating': { S: 'terminating' },
              ':updatedAt': { S: now.toISOString() },
              ':staleBefore': { S: staleBefore },
              ':expiresAt': { N: expiresAt(now, this.config.ttlSeconds) },
            },
            ReturnValues: 'ALL_OLD',
          }),
        )
      ).Attributes;
      const previousState = previous?.[STATE_ATTRIBUTE]?.S;
      if (previousState === undefined || !isRunnerLifecycleState(previousState)) {
        throw new Error(`Runner state item '${this.config.scope}/${runnerStateId(runnerId)}' returned no prior state`);
      }
      return previousState;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) {
        return undefined;
      }
      throw error;
    }
  }

  async cancelTermination(runnerId: string, restoreState: 'provisioning' | 'active' | 'orphan'): Promise<void> {
    if (restoreState !== 'provisioning' && restoreState !== 'active' && restoreState !== 'orphan') {
      throw new Error("Runner state field 'restoreState' must be 'provisioning', 'active', or 'orphan'");
    }
    await this.transition(runnerId, ['terminating'], restoreState);
  }

  async delete(runnerId: string): Promise<void> {
    validateNonEmptyString(runnerId, 'runnerId');
    await getDynamoDbClient().send(
      new DeleteItemCommand({
        TableName: this.config.tableName,
        Key: this.key(runnerId),
        ConditionExpression: '#state = :terminating',
        ExpressionAttributeNames: {
          '#state': STATE_ATTRIBUTE,
        },
        ExpressionAttributeValues: {
          ':terminating': { S: 'terminating' },
        },
      }),
    );
  }

  private async transition(
    runnerId: string,
    expectedStates: RunnerLifecycleState[],
    state: RunnerLifecycleState,
    activation: RunnerStateActivation = {},
    returnOldState = false,
  ): Promise<Record<string, AttributeValue> | undefined> {
    validateNonEmptyString(runnerId, 'runnerId');
    const now = new Date();
    const expressionAttributeNames: Record<string, string> = {
      '#scope': SCOPE_ATTRIBUTE,
      '#id': ID_ATTRIBUTE,
      '#state': STATE_ATTRIBUTE,
      '#updatedAt': UPDATED_AT_ATTRIBUTE,
      '#expiresAt': EXPIRES_AT_ATTRIBUTE,
    };
    const expressionAttributeValues: Record<string, AttributeValue> = {
      ':state': { S: state },
      ':updatedAt': { S: now.toISOString() },
    };
    const updates = ['#state = :state', '#updatedAt = :updatedAt'];
    const hasSafetyTtl = state === 'provisioning' || state === 'terminating';
    if (hasSafetyTtl) {
      expressionAttributeValues[':expiresAt'] = { N: expiresAt(now, this.config.ttlSeconds) };
      updates.push('#expiresAt = :expiresAt');
    }
    addActivationUpdates(updates, expressionAttributeNames, expressionAttributeValues, activation);

    const expectedStateValues = expectedStates.map((expectedState, index) => {
      const placeholder = `:expectedState${index}`;
      expressionAttributeValues[placeholder] = { S: expectedState };
      return placeholder;
    });

    const result = await getDynamoDbClient().send(
      new UpdateItemCommand({
        TableName: this.config.tableName,
        Key: this.key(runnerId),
        UpdateExpression: `SET ${updates.join(', ')}${hasSafetyTtl ? '' : ' REMOVE #expiresAt'}`,
        ConditionExpression: `attribute_exists(#scope) AND attribute_exists(#id) AND #state IN (${expectedStateValues.join(', ')})`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: returnOldState ? 'ALL_OLD' : undefined,
      }),
    );
    return result.Attributes;
  }

  private key(runnerId: string): Record<string, AttributeValue> {
    return {
      [SCOPE_ATTRIBUTE]: { S: this.config.scope },
      [ID_ATTRIBUTE]: { S: runnerStateId(runnerId) },
    };
  }
}

function parseRunnerStateRecord(item: Record<string, AttributeValue>, scope: string): RunnerStateRecord {
  const id = requiredStringAttribute(item, ID_ATTRIBUTE, scope);
  const runnerType = requiredStringAttribute(item, RUNNER_TYPE_ATTRIBUTE, `${scope}/${id}`);
  if (runnerType !== 'Org' && runnerType !== 'Repo') {
    throw invalidItem(`${scope}/${id}`, RUNNER_TYPE_ATTRIBUTE);
  }

  return {
    runnerId: requiredStringAttribute(item, RUNNER_ID_ATTRIBUTE, `${scope}/${id}`),
    computeProvider: requiredStringAttribute(item, COMPUTE_PROVIDER_ATTRIBUTE, `${scope}/${id}`),
    computeResourceId: requiredStringAttribute(item, COMPUTE_RESOURCE_ID_ATTRIBUTE, `${scope}/${id}`),
    runnerName: optionalStringAttribute(item, RUNNER_NAME_ATTRIBUTE, `${scope}/${id}`),
    runnerLabels: optionalStringListAttribute(item, RUNNER_LABELS_ATTRIBUTE, `${scope}/${id}`),
    githubRunnerId: optionalStringAttribute(item, GITHUB_RUNNER_ID_ATTRIBUTE, `${scope}/${id}`),
    runnerOwner: requiredStringAttribute(item, RUNNER_OWNER_ATTRIBUTE, `${scope}/${id}`),
    runnerType,
    state: requiredLifecycleState(item, `${scope}/${id}`),
    createdAt: requiredTimestampAttribute(item, CREATED_AT_ATTRIBUTE, `${scope}/${id}`),
    updatedAt: requiredTimestampAttribute(item, UPDATED_AT_ATTRIBUTE, `${scope}/${id}`),
    metadata: optionalMetadataAttribute(item, `${scope}/${id}`),
  };
}

function requiredLifecycleState(item: Record<string, AttributeValue>, itemId: string): RunnerLifecycleState {
  const state = requiredStringAttribute(item, STATE_ATTRIBUTE, itemId);
  if (!isRunnerLifecycleState(state)) {
    throw invalidItem(itemId, STATE_ATTRIBUTE);
  }
  return state;
}

function isRunnerLifecycleState(value: string): value is RunnerLifecycleState {
  return value === 'provisioning' || value === 'active' || value === 'orphan' || value === 'terminating';
}

function requiredStringAttribute(item: Record<string, AttributeValue>, name: string, itemId: string): string {
  const value = item[name]?.S;
  if (value === undefined || value.trim() === '') {
    throw invalidItem(itemId, name);
  }
  return value;
}

function optionalStringAttribute(
  item: Record<string, AttributeValue>,
  name: string,
  itemId: string,
): string | undefined {
  if (item[name] === undefined) {
    return undefined;
  }
  return requiredStringAttribute(item, name, itemId);
}

function optionalStringListAttribute(
  item: Record<string, AttributeValue>,
  name: string,
  itemId: string,
): string[] | undefined {
  const attribute = item[name];
  if (attribute === undefined) {
    return undefined;
  }
  if (!attribute.L) {
    throw invalidItem(itemId, name);
  }

  return attribute.L.map((value) => {
    if (value.S === undefined || value.S.trim() === '') {
      throw invalidItem(itemId, name);
    }
    return value.S;
  });
}

function requiredTimestampAttribute(item: Record<string, AttributeValue>, name: string, itemId: string): string {
  const value = requiredStringAttribute(item, name, itemId);
  try {
    if (new Date(value).toISOString() !== value) {
      throw invalidItem(itemId, name);
    }
  } catch {
    throw invalidItem(itemId, name);
  }
  return value;
}

function optionalMetadataAttribute(
  item: Record<string, AttributeValue>,
  itemId: string,
): RunnerConfigMetadata[] | undefined {
  const metadata = item[METADATA_ATTRIBUTE];
  if (metadata === undefined) {
    return undefined;
  }
  if (!metadata.L) {
    throw invalidItem(itemId, METADATA_ATTRIBUTE);
  }

  return metadata.L.map((entry) => {
    if (!entry.M) {
      throw invalidItem(itemId, METADATA_ATTRIBUTE);
    }
    return {
      key: requiredStringAttribute(entry.M, 'key', itemId),
      value: requiredMetadataValue(entry.M, itemId),
    };
  });
}

function validateCreateRecord(record: CreateRunnerStateRecord): void {
  validateNonEmptyString(record.runnerId, 'runnerId');
  validateNonEmptyString(record.computeProvider, 'computeProvider');
  validateNonEmptyString(record.computeResourceId, 'computeResourceId');
  validateOptionalString(record.runnerName, 'runnerName');
  validateOptionalStringList(record.runnerLabels, 'runnerLabels');
  validateNonEmptyString(record.runnerOwner, 'runnerOwner');
  validateRunnerType(record.runnerType);
  for (const metadata of record.metadata ?? []) {
    validateNonEmptyString(metadata.key, 'metadata.key');
    validateString(metadata.value, 'metadata.value');
  }
}

function validateActivation(activation: RunnerStateActivation): void {
  validateOptionalString(activation.runnerName, 'runnerName');
  validateOptionalStringList(activation.runnerLabels, 'runnerLabels');
  validateOptionalString(activation.githubRunnerId, 'githubRunnerId');
  for (const metadata of activation.metadata ?? []) {
    validateNonEmptyString(metadata.key, 'metadata.key');
    validateString(metadata.value, 'metadata.value');
  }
}

function validateRunnerType(value: RunnerType): void {
  if (value !== 'Org' && value !== 'Repo') {
    throw new Error("Runner state field 'runnerType' must be 'Org' or 'Repo'");
  }
}

function validateOptionalString(value: string | undefined, name: string): void {
  if (value !== undefined) {
    validateNonEmptyString(value, name);
  }
}

function validateOptionalStringList(values: string[] | undefined, name: string): void {
  for (const value of values ?? []) {
    validateNonEmptyString(value, name);
  }
}

function validateNonEmptyString(value: string, name: string): void {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Runner state field '${name}' must be a non-empty string`);
  }
}

function validateString(value: string, name: string): void {
  if (typeof value !== 'string') {
    throw new Error(`Runner state field '${name}' must be a string`);
  }
}

function requiredMetadataValue(item: Record<string, AttributeValue>, itemId: string): string {
  const value = item.value?.S;
  if (value === undefined) {
    throw invalidItem(itemId, METADATA_ATTRIBUTE);
  }
  return value;
}

function setOptionalString(item: Record<string, AttributeValue>, name: string, value: string | undefined): void {
  if (value !== undefined) {
    item[name] = { S: value };
  }
}

function setOptionalStringList(item: Record<string, AttributeValue>, name: string, values: string[] | undefined): void {
  if (values !== undefined) {
    item[name] = { L: values.map((value) => ({ S: value })) };
  }
}

function addActivationUpdates(
  updates: string[],
  names: Record<string, string>,
  values: Record<string, AttributeValue>,
  activation: RunnerStateActivation,
): void {
  addOptionalStringUpdate(
    updates,
    names,
    values,
    '#runnerName',
    ':runnerName',
    RUNNER_NAME_ATTRIBUTE,
    activation.runnerName,
  );
  addOptionalStringListUpdate(
    updates,
    names,
    values,
    '#runnerLabels',
    ':runnerLabels',
    RUNNER_LABELS_ATTRIBUTE,
    activation.runnerLabels,
  );
  addOptionalStringUpdate(
    updates,
    names,
    values,
    '#githubRunnerId',
    ':githubRunnerId',
    GITHUB_RUNNER_ID_ATTRIBUTE,
    activation.githubRunnerId,
  );
  if (activation.metadata !== undefined) {
    names['#metadata'] = METADATA_ATTRIBUTE;
    values[':metadata'] = {
      L: activation.metadata.map(({ key, value }) => ({ M: { key: { S: key }, value: { S: value } } })),
    };
    updates.push('#metadata = :metadata');
  }
}

function addOptionalStringUpdate(
  updates: string[],
  names: Record<string, string>,
  values: Record<string, AttributeValue>,
  namePlaceholder: string,
  valuePlaceholder: string,
  attributeName: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    names[namePlaceholder] = attributeName;
    values[valuePlaceholder] = { S: value };
    updates.push(`${namePlaceholder} = ${valuePlaceholder}`);
  }
}

function addOptionalStringListUpdate(
  updates: string[],
  names: Record<string, string>,
  values: Record<string, AttributeValue>,
  namePlaceholder: string,
  valuePlaceholder: string,
  attributeName: string,
  value: string[] | undefined,
): void {
  if (value !== undefined) {
    names[namePlaceholder] = attributeName;
    values[valuePlaceholder] = { L: value.map((entry) => ({ S: entry })) };
    updates.push(`${namePlaceholder} = ${valuePlaceholder}`);
  }
}

function setMetadata(item: Record<string, AttributeValue>, metadata: RunnerConfigMetadata[] | undefined): void {
  if (metadata && metadata.length > 0) {
    item[METADATA_ATTRIBUTE] = {
      L: metadata.map(({ key, value }) => ({ M: { key: { S: key }, value: { S: value } } })),
    };
  }
}

function expiresAt(now: Date, ttlSeconds: number): string {
  return (Math.floor(now.getTime() / 1000) + ttlSeconds).toString();
}

function invalidItem(itemId: string, attribute: string): Error {
  return new Error(`Runner state item '${itemId}' has an invalid '${attribute}' attribute`);
}

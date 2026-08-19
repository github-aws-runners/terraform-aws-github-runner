type DynamoDbEnvironmentVariable =
  | 'RUNNER_CONFIG_DYNAMODB_CONFIG_KEY_PREFIX'
  | 'RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME'
  | 'RUNNER_CONFIG_DYNAMODB_TABLE_NAME'
  | 'RUNNER_CONFIG_DYNAMODB_TOKEN_KEY_PREFIX'
  | 'RUNNER_CONFIG_DYNAMODB_TTL_SECONDS';

export function requiredEnvironmentValue(name: DynamoDbEnvironmentVariable): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is not set`);
  }

  return value;
}

export function positiveIntegerEnvironmentValue(name: DynamoDbEnvironmentVariable): number {
  const value = requiredEnvironmentValue(name);
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Environment variable ${name} must be a positive integer`);
  }

  return parsed;
}

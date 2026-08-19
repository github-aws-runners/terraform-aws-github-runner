export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      RUNNER_CONFIG_DYNAMODB_CONFIG_KEY_PREFIX?: string;
      RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME?: string;
      RUNNER_CONFIG_DYNAMODB_TABLE_NAME?: string;
      RUNNER_CONFIG_DYNAMODB_TOKEN_KEY_PREFIX?: string;
      RUNNER_CONFIG_DYNAMODB_TTL_SECONDS?: string;
    }
  }
}

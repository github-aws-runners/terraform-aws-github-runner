export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      RUNNER_CONFIG_DYNAMODB_CONFIG_TABLE_NAME?: string;
      RUNNER_CONFIG_DYNAMODB_ENTRY_ID?: string;
      RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME?: string;
      RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TTL_SECONDS?: string;
      RUNNER_CONFIG_DYNAMODB_TTL_SECONDS?: string;
    }
  }
}

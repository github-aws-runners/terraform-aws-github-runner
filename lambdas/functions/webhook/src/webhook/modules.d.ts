declare namespace NodeJS {
  export interface ProcessEnv {
    ENVIRONMENT: string;
    PARAMETER_GITHUB_APP_WEBHOOK_SECRET: string;
    REPOSITORY_WHITE_LIST: string;
    RUNNER_LABELS: string;
  }
}

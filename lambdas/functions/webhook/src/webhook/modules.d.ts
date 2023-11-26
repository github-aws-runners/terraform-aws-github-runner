declare namespace NodeJS {
  export interface ProcessEnv {
    ENVIRONMENT: string;
    PARAMETER_GITHUB_APP_WEBHOOK_SECRET: string;
    REPOSITORY_ALLOW_LIST: string;
    RUNNER_LABELS: string;
  }
}

declare namespace NodeJS {
  export interface ProcessEnv {
    ENVIRONMENT: string;
    EVENT_BUS_NAME: string;
    PARAMETER_GITHUB_APP_WEBHOOK_SECRET: string;
    PARAMETER_RUNNER_MATCHER_CONFIG_PATH: string;
    REPOSITORY_ALLOW_LIST: string;
    j;
    RUNNER_LABELS: string;
    ALLOWED_EVENTS: string;
    WORKFLOW_JOB_EVENT_SECONDARY_QUEUE: string;
  }
}

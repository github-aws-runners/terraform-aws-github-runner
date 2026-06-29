declare namespace NodeJS {
  export interface ProcessEnv {
    ENVIRONMENT: string;
    EVENT_BUS_NAME: string;
    PARAMETER_GITHUB_APP_WEBHOOK_SECRET: string;
    PARAMETER_RUNNER_MATCHER_CONFIG_PATH: string;
    QUEUE_SELECTION_STRATEGY: string;
    REPOSITORY_ALLOW_LIST: string;
    RUNNER_LABELS: string;
    ACCEPT_EVENTS: string;
  }
}

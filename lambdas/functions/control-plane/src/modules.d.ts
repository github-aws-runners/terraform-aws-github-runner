declare namespace NodeJS {
  export interface ProcessEnv {
    AWS_REGION: string;
    ENABLE_METRIC_GITHUB_APP_RATE_LIMIT: string;
    ENVIRONMENT: string;
    GHES_URL: string;
    JOB_RETRY_CONFIG: string;
    LOG_LEVEL: 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    LOG_TYPE: 'json' | 'pretty' | 'hidden';
    MINIMUM_RUNNING_TIME_IN_MINUTES: string;
    SCALE_DOWN_IDLE_CONFIRMATION_SECONDS?: string;
    RUNNER_OWNER: string;
    COMPUTE_PROVIDER_TYPE?: string;
    SCALE_DOWN_CONFIG: string;
  }
}

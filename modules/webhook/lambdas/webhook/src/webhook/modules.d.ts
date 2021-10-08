declare namespace NodeJS {
  export interface ProcessEnv {
    ENVIRONMENT: string;
    LOG_LEVEL: 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    LOG_TYPE: 'json' | 'pretty' | 'hidden';
    REPOSITORY_WHITE_LIST: string;
    RUNNER_LABELS: string;
  }
}

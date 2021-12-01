declare namespace NodeJS {
  export interface ProcessEnv {
    AWS_REGION: string;
    ENVIRONMENT: string;
    GHES_URL: string;
    LAUNCH_TEMPLATE_NAME: string;
    LOG_LEVEL: 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    LOG_TYPE: 'json' | 'pretty' | 'hidden';
    MINIMUM_RUNNING_TIME_IN_MINUTES: string;
    PARAMETER_GITHUB_APP_CLIENT_ID_NAME: string;
    PARAMETER_GITHUB_APP_CLIENT_SECRET_NAME: string;
    PARAMETER_GITHUB_APP_ID_NAME: string;
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME: string;
    SCALE_DOWN_CONFIG: string;
    SUBNET_IDS: string;
  }
}

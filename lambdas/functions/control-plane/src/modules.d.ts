declare namespace NodeJS {
  export interface ProcessEnv {
    AWS_REGION: string;
    ENABLE_METRIC_GITHUB_APP_RATE_LIMIT: string;
    ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS: string;
    ENVIRONMENT: string;
    GHES_URL: string;
    JOB_RETRY_CONFIG: string;
    LAUNCH_TEMPLATE_NAME: string;
    LOG_LEVEL: 'silly' | 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
    LOG_TYPE: 'json' | 'pretty' | 'hidden';
    MINIMUM_RUNNING_TIME_IN_MINUTES: string;
    PARAMETER_GITHUB_APP_CLIENT_ID_NAME: string;
    PARAMETER_GITHUB_APP_CLIENT_SECRET_NAME: string;
    PARAMETER_GITHUB_APP_ID_NAME: string;
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME: string;
    RUNNER_OWNER: string;
    SCALE_DOWN_CONFIG: string;
    SSM_TOKEN_PATH: string;
    SSM_CLEANUP_CONFIG: string;
    SUBNET_IDS: string;
    INSTANCE_TYPES: string;
    INSTANCE_TARGET_CAPACITY_TYPE: 'on-demand' | 'spot';
    INSTANCE_MAX_SPOT_PRICE: string | undefined;
    INSTANCE_ALLOCATION_STRATEGY:
      | 'lowest-price'
      | 'price-capacity-optimized'
      | 'diversified'
      | 'capacity-optimized'
      | 'capacity-optimized-prioritized';
  }
}

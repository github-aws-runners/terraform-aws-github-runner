declare namespace NodeJS {
  export interface ProcessEnv {
    ENABLE_METRICS?: 'true' | 'false';
    ENVIRONMENT: string;
    PREFIX?: string;
    TAG_FILTERS?: string;
    ENABLE_RUNNER_DEREGISTRATION?: 'true' | 'false';
    GHES_URL?: string;
    PARAMETER_GITHUB_APP_ID_NAME?: string;
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME?: string;
  }
}

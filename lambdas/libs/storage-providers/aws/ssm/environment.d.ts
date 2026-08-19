export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PARAMETER_GITHUB_APP_ID_NAME?: string;
      PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME?: string;
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME?: string;
      PARAMETER_RUNNER_MATCHER_CONFIG_PATH?: string;
      SSM_CONFIG_PATH?: string;
      SSM_CLEANUP_CONFIG?: string;
      SSM_PARAMETER_STORE_TAGS?: string;
      SSM_TOKEN_PATH?: string;
    }
  }
}

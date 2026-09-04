export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      SSM_PARAMETER_STORE_TAGS?: string;
      SSM_TOKEN_PATH?: string;
      PARAMETER_GITHUB_APP_ID_NAME?: string;
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME?: string;
      PARAMETER_GITHUB_APP_INSTALLATION_ID_NAME?: string;
    }
  }
}

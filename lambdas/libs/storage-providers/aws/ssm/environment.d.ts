export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      SSM_CONFIG_PATH?: string;
      SSM_CLEANUP_CONFIG?: string;
      SSM_PARAMETER_STORE_TAGS?: string;
      SSM_TOKEN_PATH?: string;
    }
  }
}

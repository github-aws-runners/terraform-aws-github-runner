export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      SSM_PARAMETER_STORE_TAGS?: string;
      SSM_TOKEN_PATH?: string;
    }
  }
}

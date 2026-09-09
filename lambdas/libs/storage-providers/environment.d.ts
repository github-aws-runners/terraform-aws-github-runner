export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      RUNNER_CONFIG_STORAGE_PROVIDER?: string;
    }
  }
}

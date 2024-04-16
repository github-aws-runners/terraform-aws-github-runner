declare namespace NodeJS {
  export interface ProcessEnv {
    ENABLE_METRICS?: 'true' | 'false';
    ENVIRONMENT: string;
    PREFIX?: string;
    TAG_FILTERS?: string;
  }
}

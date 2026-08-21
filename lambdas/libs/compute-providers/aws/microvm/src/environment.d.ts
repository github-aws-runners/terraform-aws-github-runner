export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      MICROVM_EGRESS_NETWORK_CONNECTORS: string | undefined;
      MICROVM_EXECUTION_ROLE_ARN: string;
      MICROVM_IMAGE_ARN: string;
      MICROVM_IMAGE_VERSION: string | undefined;
      MICROVM_INGRESS_NETWORK_CONNECTORS: string | undefined;
      MICROVM_LOG_GROUP: string | undefined;
      MICROVM_METADATA_SSM_PATH: string;
      SSM_TOKEN_PATH: string;
    }
  }
}

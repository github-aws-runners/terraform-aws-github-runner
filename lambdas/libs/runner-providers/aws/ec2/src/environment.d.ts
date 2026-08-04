export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      ENVIRONMENT: string;
      LAUNCH_TEMPLATE_NAME: string;
      SUBNET_IDS: string;
      INSTANCE_TYPES: string;
      INSTANCE_TARGET_CAPACITY_TYPE: 'on-demand' | 'spot';
      INSTANCE_MAX_SPOT_PRICE: string | undefined;
      INSTANCE_ALLOCATION_STRATEGY:
        | 'lowest-price'
        | 'price-capacity-optimized'
        | 'diversified'
        | 'capacity-optimized'
        | 'capacity-optimized-prioritized'
        | 'prioritized';
      SCALE_ERRORS: string;
    }
  }
}

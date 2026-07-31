import { provider as ec2 } from './aws/ec2';
import type { RunnerProviderModule } from './contracts';

/**
 * Provider plugins enabled in webhook and control-plane bundles.
 * Installing and enabling a provider requires adding it only to this list.
 */
export const enabledRunnerProviders = [ec2] as const satisfies readonly RunnerProviderModule[];

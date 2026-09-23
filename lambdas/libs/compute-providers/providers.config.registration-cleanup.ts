import { provider as ec2 } from './aws/ec2/registration-cleanup';
import type { RegistrationCleanupProviderModule } from './registration-cleanup';

/** Provider plugins included in the registration cleanup bundle. */
export const enabledRegistrationCleanupProviders = [
  ec2,
] as const satisfies readonly RegistrationCleanupProviderModule[];

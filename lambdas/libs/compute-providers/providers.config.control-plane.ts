import { provider as ec2 } from './aws/ec2/control-plane';
import { provider as microvm } from './aws/microvm/control-plane';
import type { ControlPlaneProviderModule } from './contracts';

/** Provider plugins included in the control-plane bundle. */
export const enabledControlPlaneProviders = [ec2, microvm] as const satisfies readonly ControlPlaneProviderModule[];

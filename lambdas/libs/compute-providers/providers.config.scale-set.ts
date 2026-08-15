import { provider as ec2 } from './aws/ec2/scale-set';
import type { ScaleSetProviderModule } from './contracts';

/** Provider plugins included in the scale-set listener bundle. */
export const enabledScaleSetProviders = [ec2] as const satisfies readonly ScaleSetProviderModule[];

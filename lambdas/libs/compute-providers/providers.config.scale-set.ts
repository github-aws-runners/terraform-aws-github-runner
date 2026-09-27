import { provider as ec2 } from './aws/ec2/scale-set';
import type { ScaleSetComputeProviderModule } from './scale-set';

/** Provider plugins included in the scale-set service bundle. */
export const enabledScaleSetProviders = [ec2] as const satisfies readonly ScaleSetComputeProviderModule[];

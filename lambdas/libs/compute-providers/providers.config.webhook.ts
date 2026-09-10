import { provider as ec2 } from './aws/ec2/webhook';
import type { WebhookProviderModule } from './contracts';

/** Provider plugins included in the webhook bundle. */
export const enabledWebhookProviders = [ec2] as const satisfies readonly WebhookProviderModule[];

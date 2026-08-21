import { provider as ec2 } from './aws/ec2/webhook';
import { provider as microvm } from './aws/microvm/webhook';
import type { WebhookProviderModule } from './contracts';

/** Provider plugins included in the webhook bundle. */
export const enabledWebhookProviders = [ec2, microvm] as const satisfies readonly WebhookProviderModule[];

import type { SsmParameterTier } from '@aws-github-runner/aws-ssm-util';

export function parseSsmRunnerConfigTier(tier: string | undefined): SsmParameterTier | undefined {
  if (!tier || tier.trim() === '') {
    return undefined;
  }
  if (tier !== 'Standard' && tier !== 'Advanced') {
    throw new Error(`SSM_RUNNER_CONFIG_TIER must be either "Standard" or "Advanced", got "${tier}"`);
  }
  return tier;
}

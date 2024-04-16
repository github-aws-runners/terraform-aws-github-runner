import { createChildLogger } from '@terraform-aws-github-runner/aws-powertools-util';

export class Config {
  createSpotWarningMetric: boolean;
  tagFilters: Record<string, string>;
  prefix: string;

  constructor() {
    const logger = createChildLogger('config-resolver');

    logger.debug('Loading config from environment variables', { env: process.env });

    this.createSpotWarningMetric = process.env.ENABLE_METRICS_SPOT_WARNING === 'true';
    this.prefix = process.env.PREFIX ?? '';
    this.tagFilters = { 'ghr:environment': this.prefix };

    const rawTagFilters = process.env.TAG_FILTERS;
    if (rawTagFilters && rawTagFilters !== 'null') {
      try {
        this.tagFilters = JSON.parse(rawTagFilters);
      } catch (e) {
        logger.error('Failed to parse TAG_FILTERS', { error: e });
      }
    }

    logger.debug('Loaded config', { config: this });
  }
}

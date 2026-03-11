import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

export class Config {
  createSpotWarningMetric: boolean;
  createSpotTerminationMetric: boolean;
  tagFilters: Record<string, string>;
  prefix: string;
  enableRunnerDeregistration: boolean;
  ghesApiUrl: string;

  constructor() {
    const logger = createChildLogger('config-resolver');

    logger.debug('Loading config from environment variables', { env: process.env });

    this.createSpotWarningMetric = process.env.ENABLE_METRICS_SPOT_WARNING === 'true';
    this.createSpotTerminationMetric = process.env.ENABLE_METRICS_SPOT_TERMINATION === 'true';
    this.prefix = process.env.PREFIX ?? '';
    this.enableRunnerDeregistration = process.env.ENABLE_RUNNER_DEREGISTRATION === 'true';
    this.ghesApiUrl = process.env.GHES_URL ?? '';
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

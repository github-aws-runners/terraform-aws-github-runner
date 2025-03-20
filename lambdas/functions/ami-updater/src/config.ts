import { logger } from '@aws-github-runner/aws-powertools-util';

import { AMIFilterConfig } from './ami';

export interface Config {
  launchTemplateName: string;
  dryRun: boolean;
  amiFilter: AMIFilterConfig;
}

export function getConfig(): Config {
  const launchTemplateName = process.env.LAUNCH_TEMPLATE_NAME;
  if (!launchTemplateName) {
    throw new Error('LAUNCH_TEMPLATE_NAME environment variable is not set');
  }

  const amiFilterStr = process.env.AMI_FILTER;
  if (!amiFilterStr) {
    throw new Error('AMI_FILTER environment variable is not set');
  }

  let amiFilter: AMIFilterConfig;
  try {
    amiFilter = JSON.parse(amiFilterStr);
  } catch (error) {
    logger.error('Failed to parse AMI_FILTER', { error, amiFilterStr });
    throw new Error('Invalid AMI_FILTER format');
  }

  if (!Array.isArray(amiFilter.owners) || !Array.isArray(amiFilter.filters)) {
    throw new Error('AMI_FILTER must contain owners (array) and filters (array)');
  }

  const dryRun = process.env.DRY_RUN?.toLowerCase() === 'true';

  return {
    launchTemplateName,
    dryRun,
    amiFilter,
  };
}
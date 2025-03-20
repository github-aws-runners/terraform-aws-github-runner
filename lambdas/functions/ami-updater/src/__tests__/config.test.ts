import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getConfig } from '../config';

vi.mock('../../shared/aws-powertools-util', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('getConfig', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {};
  });

  it('should return valid configuration when all environment variables are set correctly', () => {
    process.env.LAUNCH_TEMPLATE_NAME = 'test-template';
    process.env.DRY_RUN = 'true';
    process.env.AMI_FILTER = JSON.stringify({
      owners: ['self'],
      filters: [{ name: 'tag:Environment', values: ['prod'] }],
    });

    const config = getConfig();

    expect(config).toEqual({
      launchTemplateName: 'test-template',
      dryRun: true,
      amiFilter: {
        owners: ['self'],
        filters: [{ name: 'tag:Environment', values: ['prod'] }],
      },
    });
  });

  it('should handle DRY_RUN=false correctly', () => {
    process.env.LAUNCH_TEMPLATE_NAME = 'test-template';
    process.env.DRY_RUN = 'false';
    process.env.AMI_FILTER = JSON.stringify({
      owners: ['self'],
      filters: [{ name: 'tag:Environment', values: ['prod'] }],
    });

    const config = getConfig();
    expect(config.dryRun).toBe(false);
  });

  it('should throw error when LAUNCH_TEMPLATE_NAME is not set', () => {
    process.env.AMI_FILTER = JSON.stringify({
      owners: ['self'],
      filters: [{ name: 'tag:Environment', values: ['prod'] }],
    });

    expect(() => getConfig()).toThrow('LAUNCH_TEMPLATE_NAME environment variable is not set');
  });

  it('should throw error when AMI_FILTER is not set', () => {
    process.env.LAUNCH_TEMPLATE_NAME = 'test-template';

    expect(() => getConfig()).toThrow('AMI_FILTER environment variable is not set');
  });

  it('should throw error when AMI_FILTER is invalid JSON', () => {
    process.env.LAUNCH_TEMPLATE_NAME = 'test-template';
    process.env.AMI_FILTER = 'invalid-json';

    expect(() => getConfig()).toThrow('Invalid AMI_FILTER format');
  });

  it('should throw error when AMI_FILTER has invalid structure', () => {
    process.env.LAUNCH_TEMPLATE_NAME = 'test-template';
    process.env.AMI_FILTER = JSON.stringify({
      owners: 'not-an-array',
      filters: 'not-an-array',
    });

    expect(() => getConfig()).toThrow('AMI_FILTER must contain owners (array) and filters (array)');
  });
});
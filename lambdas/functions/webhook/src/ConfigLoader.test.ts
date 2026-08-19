import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { getRunnerMatcherConfigStore, type RunnerMatcherConfigStore } from '@aws-github-runner/storage-providers';
import { ConfigWebhook, ConfigWebhookEventBridge, ConfigDispatcher } from './ConfigLoader';

import { logger } from '@aws-github-runner/aws-powertools-util';
import { RunnerMatcherConfig } from './sqs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@aws-github-runner/aws-ssm-util');
vi.mock('@aws-github-runner/storage-providers');

const runnerMatcherConfigStore = {
  get: vi.fn(),
} satisfies RunnerMatcherConfigStore;

describe('ConfigLoader Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ConfigWebhook.reset();
    ConfigWebhookEventBridge.reset();
    ConfigDispatcher.reset();
    logger.setLogLevel('DEBUG');
    vi.mocked(getRunnerMatcherConfigStore).mockReturnValue(runnerMatcherConfigStore);

    // clear process.env
    for (const key of Object.keys(process.env)) {
      delete process.env[key];
    }
  });

  describe('Check base object', () => {
    function setupConfiguration(): void {
      process.env.EVENT_BUS_NAME = 'event-bus';
      process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET = '/path/to/webhook/secret';
      const matcherConfig = [
        {
          id: '1',
          arn: 'arn:aws:sqs:us-east-1:123456789012:queue1',
          matcherConfig: {
            labelMatchers: [['label1', 'label2']],
            exactMatch: true,
          },
        },
      ];
      runnerMatcherConfigStore.get.mockResolvedValue(JSON.stringify(matcherConfig));
      vi.mocked(getParameter).mockResolvedValue('secret');
    }

    it('should return the same instance of ConfigWebhook (singleton)', async () => {
      setupConfiguration();
      const config1 = await ConfigWebhook.load();
      const config2 = await ConfigWebhook.load();

      expect(config1).toBe(config2);
      expect(getParameter).toHaveBeenCalledOnce();
      expect(runnerMatcherConfigStore.get).toHaveBeenCalledOnce();
    });

    it('should return the same instance of ConfigWebhookEventBridge (singleton)', async () => {
      setupConfiguration();
      const config1 = await ConfigWebhookEventBridge.load();
      const config2 = await ConfigWebhookEventBridge.load();

      expect(config1).toBe(config2);
      expect(getParameter).toHaveBeenCalledTimes(1);
      expect(runnerMatcherConfigStore.get).not.toHaveBeenCalled();
    });

    it('should return the same instance of ConfigDispatcher (singleton)', async () => {
      setupConfiguration();
      const config1 = await ConfigDispatcher.load();
      const config2 = await ConfigDispatcher.load();

      expect(config1).toBe(config2);
      expect(getParameter).not.toHaveBeenCalled();
      expect(runnerMatcherConfigStore.get).toHaveBeenCalledOnce();
    });

    it('should filter secrets from being logged', async () => {
      setupConfiguration();
      const spy = vi.spyOn(logger, 'debug');

      await ConfigWebhook.load();

      expect(spy).toHaveBeenCalledWith(
        'Config loaded',
        expect.objectContaining({
          config: expect.objectContaining({
            webhookSecret: '***',
          }),
        }),
      );
    });
  });

  describe('ConfigWebhook', () => {
    it('should load config successfully', async () => {
      process.env.REPOSITORY_ALLOW_LIST = '["repo1", "repo2"]';
      process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET = '/path/to/webhook/secret';
      const matcherConfig = [
        {
          id: '1',
          arn: 'arn:aws:sqs:us-east-1:123456789012:queue1',
          matcherConfig: {
            labelMatchers: [['label1', 'label2']],
            exactMatch: true,
          },
        },
      ];
      runnerMatcherConfigStore.get.mockResolvedValue(JSON.stringify(matcherConfig));
      vi.mocked(getParameter).mockResolvedValue('secret');

      const config: ConfigWebhook = await ConfigWebhook.load();

      expect(config.repositoryAllowList).toEqual(['repo1', 'repo2']);
      expect(config.matcherConfig).toEqual(matcherConfig);
      expect(config.webhookSecret).toBe('secret');
    });

    it('should load config successfully', async () => {
      process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET = '/path/to/webhook/secret';
      const matcherConfig = [
        {
          id: '1',
          arn: 'arn:aws:sqs:us-east-1:123456789012:queue1',
          matcherConfig: {
            labelMatchers: [['label1', 'label2']],
            exactMatch: true,
          },
        },
      ];
      runnerMatcherConfigStore.get.mockResolvedValue(JSON.stringify(matcherConfig));
      vi.mocked(getParameter).mockResolvedValue('secret');

      const config: ConfigWebhook = await ConfigWebhook.load();

      expect(config.repositoryAllowList).toEqual([]);
      expect(config.workflowJobEventSecondaryQueue).toBe('');
      expect(config.matcherConfig).toEqual(matcherConfig);
      expect(config.webhookSecret).toBe('secret');
    });

    it('should throw error if config loading fails', async () => {
      runnerMatcherConfigStore.get.mockRejectedValue(
        new Error(
          'Failed to load parameter for matcherConfig from path /path/to/matcher/config: Failed to load matcher config',
        ),
      );
      vi.mocked(getParameter).mockResolvedValue('');

      await expect(ConfigWebhook.load()).rejects.toThrow(
        'Failed to load config: Failed to load parameter for matcherConfig from path /path/to/matcher/config: Failed to load matcher config',
      );
    });

    it('should load combined matcher config returned by the store', async () => {
      process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET = '/path/to/webhook/secret';

      const combinedMatcherConfig = [
        { id: '1', arn: 'arn:aws:sqs:queue1', matcherConfig: { labelMatchers: [['a']], exactMatch: true } },
        { id: '2', arn: 'arn:aws:sqs:queue2', matcherConfig: { labelMatchers: [['b']], exactMatch: true } },
      ];
      runnerMatcherConfigStore.get.mockResolvedValue(JSON.stringify(combinedMatcherConfig));
      vi.mocked(getParameter).mockResolvedValue('secret');

      const config: ConfigWebhook = await ConfigWebhook.load();

      expect(config.matcherConfig).toEqual(combinedMatcherConfig);
      expect(config.webhookSecret).toBe('secret');
    });

    it('should propagate an error from the matcher config store', async () => {
      process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET = '/path/to/webhook/secret';
      runnerMatcherConfigStore.get.mockRejectedValue(
        new Error(
          "Failed to load/parse combined matcher config: Expected ',' or ']' after array element in JSON at position 196",
        ),
      );
      vi.mocked(getParameter).mockResolvedValue('secret');

      await expect(ConfigWebhook.load()).rejects.toThrow(
        "Failed to load config: Failed to load/parse combined matcher config: Expected ',' or ']' after array element in JSON at position 196",
      );
    });
  });

  describe('ConfigWebhookEventBridge', () => {
    it('should load config successfully', async () => {
      process.env.ACCEPT_EVENTS = '["push", "pull_request"]';
      process.env.EVENT_BUS_NAME = 'event-bus';
      process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET = '/path/to/webhook/secret';

      vi.mocked(getParameter).mockImplementation(async (paramPath: string) => {
        if (paramPath === '/path/to/webhook/secret') {
          return 'secret';
        }
        return '';
      });

      const config: ConfigWebhookEventBridge = await ConfigWebhookEventBridge.load();

      expect(config.allowedEvents).toEqual(['push', 'pull_request']);
      expect(config.eventBusName).toBe('event-bus');
      expect(config.webhookSecret).toBe('secret');
      expect(runnerMatcherConfigStore.get).not.toHaveBeenCalled();
    });

    it('should throw error if config loading fails', async () => {
      vi.mocked(getParameter).mockImplementation(async (paramPath: string) => {
        throw new Error(`Parameter ${paramPath} not found`);
      });

      await expect(ConfigWebhookEventBridge.load()).rejects.toThrow(
        'Failed to load config: Environment variable for eventBusName is not set and no default value provided., Failed to load parameter for webhookSecret from path undefined: Parameter undefined not found',
      );
    });
  });

  describe('ConfigDispatcher', () => {
    it('should load config successfully', async () => {
      process.env.REPOSITORY_ALLOW_LIST = '["repo1", "repo2"]';

      const matcherConfig: RunnerMatcherConfig[] = [
        {
          arn: 'arn:aws:sqs:eu-central-1:123456:npalm-default-queued-builds',
          id: 'https://sqs.eu-central-1.amazonaws.com/123456/npalm-default-queued-builds',
          matcherConfig: {
            exactMatch: true,
            labelMatchers: [['default', 'example', 'linux', 'self-hosted', 'x64']],
          },
        },
      ];
      runnerMatcherConfigStore.get.mockResolvedValue(JSON.stringify(matcherConfig));

      const config: ConfigDispatcher = await ConfigDispatcher.load();

      expect(config.repositoryAllowList).toEqual(['repo1', 'repo2']);
      expect(config.matcherConfig).toEqual(matcherConfig);
    });

    it('should load combined matcher config returned by the store with repo allow list', async () => {
      process.env.REPOSITORY_ALLOW_LIST = '["repo1", "repo2"]';

      const combined: RunnerMatcherConfig[] = [
        { id: '1', arn: 'arn:aws:sqs:queue1', matcherConfig: { labelMatchers: [['x']], exactMatch: true } },
        { id: '2', arn: 'arn:aws:sqs:queue2', matcherConfig: { labelMatchers: [['y']], exactMatch: true } },
      ];
      runnerMatcherConfigStore.get.mockResolvedValue(JSON.stringify(combined));

      const config: ConfigDispatcher = await ConfigDispatcher.load();

      expect(config.repositoryAllowList).toEqual(['repo1', 'repo2']);
      expect(config.matcherConfig).toEqual(combined);
    });

    it('should throw error if config loading fails', async () => {
      runnerMatcherConfigStore.get.mockRejectedValue(new Error('Matcher config store is unavailable'));

      await expect(ConfigDispatcher.load()).rejects.toThrow(
        'Failed to load config: Matcher config store is unavailable',
      );
    });

    it('should rely on default when optionals are not set.', async () => {
      process.env.ACCEPT_EVENTS = 'null';
      const matcherConfig: RunnerMatcherConfig[] = [
        {
          arn: 'arn:aws:sqs:eu-central-1:123456:npalm-default-queued-builds',
          id: 'https://sqs.eu-central-1.amazonaws.com/123456/npalm-default-queued-builds',
          matcherConfig: {
            exactMatch: true,
            labelMatchers: [['default', 'example', 'linux', 'self-hosted', 'x64']],
          },
        },
      ];
      runnerMatcherConfigStore.get.mockResolvedValue(JSON.stringify(matcherConfig));

      const config: ConfigDispatcher = await ConfigDispatcher.load();

      expect(config.repositoryAllowList).toEqual([]);
      expect(config.matcherConfig).toEqual(matcherConfig);
    });

    it('should throw an error if runner matcher config is empty.', async () => {
      process.env.REPOSITORY_ALLOW_LIST = '["repo1", "repo2"]';
      runnerMatcherConfigStore.get.mockResolvedValue(JSON.stringify(''));

      await expect(ConfigDispatcher.load()).rejects.toThrow('Failed to load config: Matcher config is empty');
    });
  });
});

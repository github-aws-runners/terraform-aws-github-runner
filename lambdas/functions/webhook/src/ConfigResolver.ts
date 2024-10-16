import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { RunnerMatcherConfig } from './sqs';
import { logger } from '@aws-github-runner/aws-powertools-util';

export class Config {
  repositoryAllowList: Array<string>;
  allowedEvents: Array<string> = [];
  static matcherConfig: Array<RunnerMatcherConfig> | undefined;
  static webhookSecret: string | undefined;
  workflowJobEventSecondaryQueue: string | undefined;
  eventBusName: string | undefined;

  constructor(
    repositoryAllowList: Array<string>,
    workflowJobEventSecondaryQueue: string | undefined,
    allowedEvents: string,
    eventBusName: string | undefined,
  ) {
    this.repositoryAllowList = repositoryAllowList;

    this.workflowJobEventSecondaryQueue = workflowJobEventSecondaryQueue;

    if (allowedEvents) {
      this.allowedEvents = allowedEvents.split(',');
    }

    this.eventBusName = eventBusName;
  }

  static async load(): Promise<Config> {
    const repositoryAllowListEnv = process.env.REPOSITORY_ALLOW_LIST ?? '[]';
    const allowedEvents = process.env.ALLOWED_EVENTS ?? '';
    const eventBusName = process.env.EVENT_BUS_NAME;
    const repositoryAllowList = JSON.parse(repositoryAllowListEnv) as Array<string>;
    // load parallel config if not cached
    if (!Config.matcherConfig) {
      const matcherConfigPath =
        process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH ?? '/github-runner/runner-matcher-config';
      const [matcherConfigVal, webhookSecret] = await Promise.all([
        getParameter(matcherConfigPath),
        getParameter(process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET),
      ]);
      Config.webhookSecret = webhookSecret;
      Config.matcherConfig = JSON.parse(matcherConfigVal) as Array<RunnerMatcherConfig>;
      logger.debug('Loaded queues config', { matcherConfig: Config.matcherConfig });
    }
    const workflowJobEventSecondaryQueue = process.env.SQS_WORKFLOW_JOB_QUEUE || undefined;
    return new Config(repositoryAllowList, workflowJobEventSecondaryQueue, allowedEvents, eventBusName);
  }

  static reset(): void {
    Config.matcherConfig = undefined;
  }
}

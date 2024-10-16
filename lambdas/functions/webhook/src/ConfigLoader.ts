import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { MatcherConfig, RunnerMatcherConfig } from './sqs';
import { logger } from '@aws-github-runner/aws-powertools-util';

abstract class BaseConfig {
  static instance: BaseConfig | null = null;
  configLoadingErrors: string[] = [];

  static async load<T extends BaseConfig>(): Promise<T> {
    if (!this.instance) {
      this.instance = new (this as unknown as { new (): T })();
      await this.instance.loadConfig();

      if (this.instance.configLoadingErrors.length > 0) {
        logger.debug('Failed to load config', {
          config: this.instance.logOjbect,
          errors: this.instance.configLoadingErrors,
        });
        throw new Error(`Failed to load config: ${this.instance.configLoadingErrors.join(', ')}`);
      }

      logger.debug('Config loaded', { config: this.instance.logOjbect() });
    } else {
      logger.debug('Config already loaded', { config: this.instance.logOjbect() });
    }

    return this.instance as T;
  }

  static reset(): void {
    this.instance = null;
  }

  abstract loadConfig(): Promise<void>;

  protected loadEnvVar<T>(envVar: string, propertyName: keyof this, defaultValue?: T): void {
    logger.debug(`Loading env var for ${String(propertyName)}`, { envVar });
    if (envVar !== undefined) {
      this.loadProperty<T>(propertyName, envVar);
    } else if (defaultValue !== undefined) {
      this[propertyName] = defaultValue as unknown as this[keyof this];
    } else {
      const errorMessage = `Environment variable for ${String(propertyName)} is not set and no default value provided.`;
      this.configLoadingErrors.push(errorMessage);
    }
  }

  protected async loadParameter<T>(paramPath: string, propertyName: keyof this): Promise<void> {
    logger.debug(`Loading parameter for ${String(propertyName)} from path ${paramPath}`);
    await getParameter(paramPath)
      .then((value) => {
        this.loadProperty<T>(propertyName, value);
      })
      .catch((error) => {
        const errorMessage = `Failed to load parameter for ${String(propertyName)} from path ${paramPath}: ${(error as Error).message}`;
        this.configLoadingErrors.push(errorMessage);
      });
  }

  private loadProperty<T>(propertyName: keyof this, value: string) {
    try {
      this[propertyName] = JSON.parse(value) as unknown as this[keyof this];
    } catch (error) {
      this[propertyName] = value as unknown as this[keyof this];
    }
  }

  // create a log object without secrets
  protected logOjbect(): this {
    const config = { ...this };
    for (const key in config) {
      if (key.toLowerCase().includes('secret') && config[key]) {
        config[key as keyof this] = '***' as unknown as this[keyof this];
      }
    }

    return config;
  }
}

export class ConfigWebhook extends BaseConfig {
  repositoryAllowList: string[] = [];
  matcherConfig: RunnerMatcherConfig[] = [];
  webhookSecret: string = '';
  workflowJobEventSecondaryQueue: string = '';

  async loadConfig(): Promise<void> {
    this.loadEnvVar(process.env.REPOSITORY_ALLOW_LIST, 'repositoryAllowList', []);
    this.loadEnvVar(process.env.WORKFLOW_JOB_EVENT_SECONDARY_QUEUE, 'workflowJobEventSecondaryQueue', '');

    await Promise.all([
      this.loadParameter<MatcherConfig[]>(process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH, 'matcherConfig'),
      this.loadParameter(process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET, 'webhookSecret'),
    ]);
  }
}

export class ConfigWebhookEventBridge extends BaseConfig {
  eventBusName: string | undefined;
  allowedEvents: string[] = [];
  webhookSecret: string = '';

  async loadConfig(): Promise<void> {
    this.loadEnvVar(process.env.ALLOWED_EVENTS, 'allowedEvents', []);
    this.loadEnvVar(process.env.EVENT_BUS_NAME, 'eventBusName');
    await this.loadParameter(process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET, 'webhookSecret');
  }
}

export class ConfigDispatcher extends BaseConfig {
  repositoryAllowList: string[] = [];
  matcherConfig: RunnerMatcherConfig[] = [];

  async loadConfig(): Promise<void> {
    this.loadEnvVar(process.env.REPOSITORY_ALLOW_LIST, 'repositoryAllowList', []);
    await this.loadParameter<MatcherConfig[]>(process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH, 'matcherConfig');
  }
}

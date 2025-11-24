import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { RunnerMatcherConfig } from './sqs';
import { logger } from '@aws-github-runner/aws-powertools-util';

/**
 * Base class for loading configuration from environment variables and SSM parameters.
 *
 * @remarks
 * To avoid usages or checking values can be undefined we assume that configuration is
 * set to
 * - empty string if the property is not relevant
 * - empty list if the property is not relevant
 */
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
    if (!(envVar == undefined || envVar === 'null')) {
      this.loadProperty(propertyName, envVar);
    } else if (defaultValue !== undefined) {
      this[propertyName] = defaultValue as unknown as this[keyof this];
    } else {
      const errorMessage = `Environment variable for ${String(propertyName)} is not set and no default value provided.`;
      this.configLoadingErrors.push(errorMessage);
    }
  }

  protected async loadParameter(paramPath: string, propertyName: keyof this): Promise<void> {
    logger.debug(`Loading parameter for ${String(propertyName)} from path ${paramPath}`);
    await getParameter(paramPath)
      .then((value) => {
        this.loadProperty(propertyName, value);
      })
      .catch((error) => {
        const errorMessage = `Failed to load parameter for ${String(propertyName)} from path ${paramPath}: ${(error as Error).message}`; // eslint-disable-line max-len
        this.configLoadingErrors.push(errorMessage);
      });
  }

  private loadProperty(propertyName: keyof this, value: string) {
    try {
      this[propertyName] = JSON.parse(value) as unknown as this[keyof this];
    } catch {
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

abstract class MatcherAwareConfig extends BaseConfig {
  matcherConfig: RunnerMatcherConfig[] = [];

  protected async loadMatcherConfig(paramPathsEnv: string) {
    if (!paramPathsEnv || paramPathsEnv === 'undefined' || paramPathsEnv === 'null' || !paramPathsEnv.includes(':')) {
      // Single path or invalid string → load directly
      await this.loadParameter(paramPathsEnv, 'matcherConfig');
      return;
    }

    const paths = paramPathsEnv
      .split(':')
      .map((p) => p.trim())
      .filter(Boolean);
    let combinedString = '';
    for (const path of paths) {
      await this.loadParameter(path, 'matcherConfig');
      combinedString += this.matcherConfig;
    }

    try {
      this.matcherConfig = JSON.parse(combinedString);
    } catch (error) {
      this.configLoadingErrors.push(`Failed to parse combined matcher config: ${(error as Error).message}`);
    }
  }
}

export class ConfigWebhook extends MatcherAwareConfig {
  repositoryAllowList: string[] = [];
  webhookSecret: string = '';
  workflowJobEventSecondaryQueue: string = '';

  async loadConfig(): Promise<void> {
    this.loadEnvVar(process.env.REPOSITORY_ALLOW_LIST, 'repositoryAllowList', []);

    await Promise.all([
      this.loadMatcherConfig(process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH),
      this.loadParameter(process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET, 'webhookSecret'),
    ]);

    validateWebhookSecret(this);
    validateRunnerMatcherConfig(this);
  }
}

export class ConfigWebhookEventBridge extends BaseConfig {
  eventBusName: string | undefined;
  allowedEvents: string[] = [];
  webhookSecret: string = '';

  async loadConfig(): Promise<void> {
    this.loadEnvVar(process.env.ACCEPT_EVENTS, 'allowedEvents', []);
    this.loadEnvVar(process.env.EVENT_BUS_NAME, 'eventBusName');
    await this.loadParameter(process.env.PARAMETER_GITHUB_APP_WEBHOOK_SECRET, 'webhookSecret');

    validateEventBusName(this);
    validateWebhookSecret(this);
  }
}

export class ConfigDispatcher extends MatcherAwareConfig {
  repositoryAllowList: string[] = [];
  workflowJobEventSecondaryQueue: string = ''; // Deprecated

  async loadConfig(): Promise<void> {
    this.loadEnvVar(process.env.REPOSITORY_ALLOW_LIST, 'repositoryAllowList', []);
    await this.loadMatcherConfig(process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH);

    validateRunnerMatcherConfig(this);
  }
}

function validateEventBusName(config: ConfigWebhookEventBridge): void {
  if (!config.eventBusName) {
    config.configLoadingErrors.push('Environment variable for eventBusName is not set and no default value provided.');
  }
}

function validateWebhookSecret(config: ConfigWebhookEventBridge | ConfigWebhook): void {
  if (!config.webhookSecret) {
    config.configLoadingErrors.push('Environment variable for webhookSecret is not set and no default value provided.');
  }
}

function validateRunnerMatcherConfig(config: ConfigDispatcher | ConfigWebhook): void {
  if (config.matcherConfig.length === 0) {
    config.configLoadingErrors.push('Matcher config is empty');
  }
}

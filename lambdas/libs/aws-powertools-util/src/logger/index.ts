import { Logger } from '@aws-lambda-powertools/logger';
import { Context } from 'aws-lambda';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const childLoggers: Logger[] = [];

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const defaultValues = {
  region: process.env.AWS_REGION,
  environment: process.env.ENVIRONMENT || 'N/A',
};

function getReleaseVersion(): string {
  let version = 'unknown';
  try {
    const packageFilePath = path.resolve(__dirname, 'package.json');
    version = JSON.parse(fs.readFileSync(packageFilePath, 'utf-8')).version || 'unknown';
  } catch (error) {
    logger.debug(`Failed to read package.json for version: ${(error as Error)?.message ?? 'Unknown error'}`);
  }
  return version;
}

function setContext(context: Context, module?: string) {
  logger.addPersistentLogAttributes({
    'aws-request-id': context.awsRequestId,
    'function-name': context.functionName,
    version: getReleaseVersion(),
    module: module,
  });

  // Add the context to all child loggers
  childLoggers.forEach((childLogger) => {
    childLogger.addPersistentLogAttributes({
      'aws-request-id': context.awsRequestId,
      'function-name': context.functionName,
      version: getReleaseVersion(),
    });
  });
}

const logger = new Logger({
  persistentLogAttributes: {
    ...defaultValues,
  },
});

function createChildLogger(module: string): Logger {
  const childLogger = logger.createChild({
    persistentLogAttributes: {
      module: module,
    },
  });

  childLoggers.push(childLogger);
  return childLogger;
}

type LogAttributes = {
  [key: string]: unknown;
};

function addPersistentContextToChildLogger(attributes: LogAttributes) {
  childLoggers.forEach((childLogger) => {
    childLogger.addPersistentLogAttributes(attributes);
  });
}

export { addPersistentContextToChildLogger, createChildLogger, logger, setContext };

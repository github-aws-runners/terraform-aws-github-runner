import { Logger } from '@aws-lambda-powertools/logger';
import { Context } from 'aws-lambda';

const childLoggers: Logger[] = [];

const defaultValues = {
  region: process.env.AWS_REGION,
  environment: process.env.ENVIRONMENT || 'N/A',
};

function setContext(context: Context, module?: string) {
  logger.appendPersistentKeys({
    'aws-request-id': context.awsRequestId,
    'function-name': context.functionName,
    module: module,
  });

  // Add the context to all child loggers
  childLoggers.forEach((childLogger) => {
    childLogger.appendPersistentKeys({
      'aws-request-id': context.awsRequestId,
      'function-name': context.functionName,
    });
  });
}

const logger = new Logger({
  persistentKeys: {
    ...defaultValues,
  },
});

function createChildLogger(module: string): Logger {
  const childLogger = logger.createChild({
    persistentKeys: {
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
    childLogger.appendPersistentKeys(attributes);
  });
}

export { addPersistentContextToChildLogger, createChildLogger, logger, setContext };

import { Logger } from '@aws-lambda-powertools/logger';
import { Context } from 'aws-lambda';

const childLoggers: Logger[] = [];

const defaultValues = {
  region: process.env.AWS_REGION || 'N/A',
  environment: process.env.ENVIRONMENT || 'N/A',
};

function setContext(context: Context, module?: string) {
  logger.addPersistentLogAttributes({
    'aws-request-id': context.awsRequestId,
    'function-name': context.functionName,
    module: module,
  });

  // Add the context to all child loggers
  childLoggers.forEach((childLogger) => {
    childLogger.addPersistentLogAttributes({
      'aws-request-id': context.awsRequestId,
      'function-name': context.functionName,
    });
  });
}

const logger = new Logger({
  serviceName: process.env.SERVICE_NAME || 'syncer',
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

export { createChildLogger, logger, setContext };

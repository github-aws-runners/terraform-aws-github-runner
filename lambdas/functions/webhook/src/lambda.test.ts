import { logger } from '@aws-github-runner/aws-powertools-util';
import { APIGatewayEvent, Context } from 'aws-lambda';

import { WorkflowJobEvent } from '@octokit/webhooks-types';

import { dispatchToRunners, eventBridgeWebhook, directWebhook } from './lambda';
import { publishForRunners, publishOnEventBridge } from './webhook';
import ValidationError from './ValidationError';
import { getParameter } from '@aws-github-runner/aws-ssm-util';
import { dispatch } from './runners/dispatch';
import { EventWrapper } from './types';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const event: APIGatewayEvent = {
  body: JSON.stringify(''),
  headers: { abc: undefined },
  httpMethod: '',
  isBase64Encoded: false,
  multiValueHeaders: { abc: undefined },
  multiValueQueryStringParameters: null,
  path: '',
  pathParameters: null,
  queryStringParameters: null,
  stageVariables: null,
  resource: '',
  requestContext: {
    authorizer: null,
    accountId: '123456789012',
    resourceId: '123456',
    stage: 'prod',
    requestId: 'c6af9ac6-7b61-11e6-9a41-93e8deadbeef',
    requestTime: '09/Apr/2015:12:34:56 +0000',
    requestTimeEpoch: 1428582896000,
    identity: {
      cognitoIdentityPoolId: null,
      accountId: null,
      cognitoIdentityId: null,
      caller: null,
      accessKey: null,
      sourceIp: '127.0.0.1',
      cognitoAuthenticationType: null,
      cognitoAuthenticationProvider: null,
      userArn: null,
      userAgent: 'Custom User Agent String',
      user: null,
      clientCert: null,
      apiKey: null,
      apiKeyId: null,
      principalOrgId: null,
    },
    path: '/prod/path/to/resource',
    resourcePath: '/{proxy+}',
    httpMethod: 'POST',
    apiId: '1234567890',
    protocol: 'HTTP/1.1',
  },
};

const context: Context = {
  awsRequestId: '1',
  callbackWaitsForEmptyEventLoop: false,
  functionName: '',
  functionVersion: '',
  getRemainingTimeInMillis: () => 0,
  invokedFunctionArn: '',
  logGroupName: '',
  logStreamName: '',
  memoryLimitInMB: '',
  done: () => {
    return;
  },
  fail: () => {
    return;
  },
  succeed: () => {
    return;
  },
};

vi.mock('./runners/dispatch');
vi.mock('./webhook');
vi.mock('@aws-github-runner/aws-ssm-util');

describe('Test webhook lambda wrapper.', () => {
  beforeEach(() => {
    // We mock all SSM request to resolve to a non empty array. Since we mock all implemeantions
    // relying on the config opbject that is enought to test the handlers.
    const mockedGet = vi.mocked(getParameter);
    mockedGet.mockResolvedValue('["abc"]');
    vi.clearAllMocks();
  });

  describe('Test webhook lambda wrapper.', () => {
    it('Happy flow, resolve.', async () => {
      const mock = vi.mocked(publishForRunners);
      mock.mockImplementation(() => {
        return new Promise((resolve) => {
          resolve({ body: 'test', statusCode: 200 });
        });
      });

      const result = await directWebhook(event, context);
      expect(result).toEqual({ body: 'test', statusCode: 200 });
    });

    it('An expected error, resolve.', async () => {
      const mock = vi.mocked(publishForRunners);
      mock.mockRejectedValue(new ValidationError(400, 'some error'));

      const result = await directWebhook(event, context);
      expect(result).toMatchObject({ body: 'some error', statusCode: 400 });
    });

    it('Errors are not thrown.', async () => {
      const mock = vi.mocked(publishForRunners);
      const logSpy = vi.spyOn(logger, 'error');
      mock.mockRejectedValue(new Error('some error'));
      const result = await directWebhook(event, context);
      expect(result).toMatchObject({ body: 'Check the Lambda logs for the error details.', statusCode: 500 });
      expect(logSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Lmmbda eventBridgeWebhook.', () => {
    beforeEach(() => {
      process.env.EVENT_BUS_NAME = 'test';
    });

    it('Happy flow, resolve.', async () => {
      const mock = vi.mocked(publishOnEventBridge);
      mock.mockImplementation(() => {
        return new Promise((resolve) => {
          resolve({ body: 'test', statusCode: 200 });
        });
      });

      const result = await eventBridgeWebhook(event, context);
      expect(result).toEqual({ body: 'test', statusCode: 200 });
    });

    it('Reject events .', async () => {
      const mock = vi.mocked(publishOnEventBridge);
      mock.mockRejectedValue(new Error('some error'));

      mock.mockRejectedValue(new ValidationError(400, 'some error'));

      const result = await eventBridgeWebhook(event, context);
      expect(result).toMatchObject({ body: 'some error', statusCode: 400 });
    });

    it('Errors are not thrown.', async () => {
      const mock = vi.mocked(publishOnEventBridge);
      const logSpy = vi.spyOn(logger, 'error');
      mock.mockRejectedValue(new Error('some error'));
      const result = await eventBridgeWebhook(event, context);
      expect(result).toMatchObject({ body: 'Check the Lambda logs for the error details.', statusCode: 500 });
      expect(logSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Lambda dispatchToRunners.', () => {
    it('Happy flow, resolve.', async () => {
      const mock = vi.mocked(dispatch);
      mock.mockImplementation(() => {
        return new Promise((resolve) => {
          resolve({ body: 'test', statusCode: 200 });
        });
      });

      const testEvent = {
        'detail-type': 'workflow_job',
      } as unknown as EventWrapper<WorkflowJobEvent>;

      await expect(dispatchToRunners(testEvent, context)).resolves.not.toThrow();
    });

    it('Rejects non workflow_job events.', async () => {
      const mock = vi.mocked(dispatch);
      mock.mockImplementation(() => {
        return new Promise((resolve) => {
          resolve({ body: 'test', statusCode: 200 });
        });
      });

      const testEvent = {
        'detail-type': 'non_workflow_job',
      } as unknown as EventWrapper<WorkflowJobEvent>;

      await expect(dispatchToRunners(testEvent, context)).rejects.toThrow(
        'Incorrect Event detail-type only workflow_job is accepted',
      );
    });

    it('Rejects any event causing an error.', async () => {
      const mock = vi.mocked(dispatch);
      mock.mockRejectedValue(new Error('some error'));

      const testEvent = {
        'detail-type': 'workflow_job',
      } as unknown as EventWrapper<WorkflowJobEvent>;

      await expect(dispatchToRunners(testEvent, context)).rejects.toThrow();
    });
  });
});

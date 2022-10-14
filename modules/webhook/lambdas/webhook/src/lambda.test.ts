import { APIGatewayEvent, Context } from 'aws-lambda';
import { mocked } from 'jest-mock';

import { githubWebhook } from './lambda';
import { handle } from './webhook/handler';
import { logger } from './webhook/logger';

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

jest.mock('./webhook/handler');

describe('Test scale up lambda wrapper.', () => {
  it('Happy flow, resolve.', async () => {
    const mock = mocked(handle);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve({ statusCode: 200 });
      });
    });

    const result = await githubWebhook(event, context);
    expect(result).toEqual({ statusCode: 200 });
  });

  it('An expected error, resolve.', async () => {
    const mock = mocked(handle);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve({ statusCode: 400 });
      });
    });

    const result = await githubWebhook(event, context);
    expect(result).toEqual({ statusCode: 400 });
  });

  it('Errors are not thrown.', async () => {
    const mock = mocked(handle);
    const logSpy = jest.spyOn(logger, 'error');
    mock.mockRejectedValue(new Error('some error'));
    const result = await githubWebhook(event, context);
    expect(result).toMatchObject({ statusCode: 500 });
    expect(logSpy).toBeCalledTimes(1);
  });
});

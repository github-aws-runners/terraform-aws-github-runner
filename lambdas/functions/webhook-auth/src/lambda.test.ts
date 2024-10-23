import { handler } from './lambda';
import { Context } from 'aws-lambda';
import { APIGatewayRequestAuthorizerEventV2 } from 'aws-lambda/trigger/api-gateway-authorizer';

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

// Pretty much copy/paste from here:
// https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-lambda-authorizer.html
const event: APIGatewayRequestAuthorizerEventV2 = {
  version: '2.0',
  type: 'REQUEST',
  routeArn: 'arn:aws:execute-api:us-east-1:123456789012:abcdef123/test/GET/request',
  identitySource: ['user1', '123'],
  routeKey: '$default',
  rawPath: '/my/path',
  rawQueryString: 'parameter1=value1&parameter1=value2&parameter2=value',
  cookies: ['cookie1', 'cookie2'],
  headers: {
    header1: 'value1',
    header2: 'value2',
  },
  queryStringParameters: {
    parameter1: 'value1,value2',
    parameter2: 'value',
  },
  requestContext: {
    accountId: '123456789012',
    apiId: 'api-id',
    authentication: {
      clientCert: {
        clientCertPem: 'CERT_CONTENT',
        subjectDN: 'www.example.com',
        issuerDN: 'Example issuer',
        serialNumber: '1',
        validity: {
          notBefore: 'May 28 12:30:02 2019 GMT',
          notAfter: 'Aug  5 09:36:04 2021 GMT',
        },
      },
    },
    domainName: 'id.execute-api.us-east-1.amazonaws.com',
    domainPrefix: 'id',
    http: {
      method: 'POST',
      path: '/my/path',
      protocol: 'HTTP/1.1',
      sourceIp: '81.123.56.13',
      userAgent: 'agent',
    },
    requestId: 'id',
    routeKey: '$default',
    stage: '$default',
    time: '12/Mar/2020:19:03:58 +0000',
    timeEpoch: 1583348638390,
  },
  pathParameters: { parameter1: 'value1' },
  stageVariables: { stageVariable1: 'value1', stageVariable2: 'value2' },
};

jest.mock('@aws-github-runner/aws-powertools-util');

describe('Webhook auth', () => {
  beforeAll(() => {
    jest.resetAllMocks();
  });
  it('should not pass if env var does not exist', async () => {
    const result = await handler(event, context);
    expect(result).toEqual({ isAuthorized: false });
  });
  it('should pass the IP allow list using exact ip', async () => {
    process.env.CIDR_IPV4_ALLOW_LIST = '81.123.56.13/32,81.123.56.52/32,10.0.0.0/8';
    const result = await handler(event, context);
    expect(result).toEqual({ isAuthorized: true });
  });

  it('should not pass the IP allow list.', async () => {
    process.env.CIDR_IPV4_ALLOW_LIST = '81.123.56.52/32,10.0.0.0/8';
    const result = await handler(event, context);
    expect(result).toEqual({ isAuthorized: false });
  });

  it('should pass the IP allow list using CIDR range', async () => {
    process.env.CIDR_IPV4_ALLOW_LIST = '81.123.0.0/16,10.0.0.0/8';
    const result = await handler(event, context);
    expect(result).toEqual({ isAuthorized: true });
  });
  it('should not pass of CIDR_IPV4_ALLOW_LIST has the wrong format', async () => {
    process.env.CIDR_IPV4_ALLOW_LIST = '81.123.0.0/16,10.0.0.0';
    const result = await handler(event, context);
    expect(result).toEqual({ isAuthorized: false });
  });
});

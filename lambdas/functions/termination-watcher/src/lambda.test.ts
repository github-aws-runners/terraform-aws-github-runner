import { logger } from '@aws-github-runner/aws-powertools-util';
import { Context } from 'aws-lambda';

import { handle as interruptionWarningHandlerImpl } from './termination-warning';
import { handle as terminationHandlerImpl } from './termination';
import { interruptionWarning, termination } from './lambda';
import { BidEvictedDetail, BidEvictedEvent, SpotInterruptionWarning, SpotTerminationDetail } from './types';
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./termination-warning');
vi.mock('./termination');

process.env.POWERTOOLS_METRICS_NAMESPACE = 'test';
process.env.POWERTOOLS_TRACE_ENABLED = 'true';
const spotInstanceInterruptionEvent: SpotInterruptionWarning<SpotTerminationDetail> = {
  version: '0',
  id: '1',
  'detail-type': 'EC2 Spot Instance Interruption Warning',
  source: 'aws.ec2',
  account: '123456789012',
  time: '2015-11-11T21:29:54Z',
  region: 'us-east-1',
  resources: ['arn:aws:ec2:us-east-1b:instance/i-abcd1111'],
  detail: {
    'instance-id': 'i-abcd1111',
    'instance-action': 'terminate',
  },
};

const bidEvictedEvent: BidEvictedEvent<BidEvictedDetail> = {
  version: '0',
  id: '186d7999-3121-e749-23f3-c7caec1084e1',
  'detail-type': 'AWS Service Event via CloudTrail',
  source: 'aws.ec2',
  account: '123456789012',
  time: '2024-10-09T11:48:46Z',
  region: 'eu-west-1',
  resources: [],
  detail: {
    eventVersion: '1.10',
    userIdentity: {
      accountId: '123456789012',
      invokedBy: 'sec2.amazonaws.com',
    },
    eventTime: '2024-10-09T11:48:46Z',
    eventSource: 'ec2.amazonaws.com',
    eventName: 'BidEvictedEvent',
    awsRegion: 'eu-west-1',
    sourceIPAddress: 'ec2.amazonaws.com',
    userAgent: 'ec2.amazonaws.com',
    requestParameters: null,
    responseElements: null,
    requestID: 'ebf032e3-5009-3484-aae8-b4946ab2e2eb',
    eventID: '3a15843b-96c2-41b1-aac1-7d62dc754547',
    readOnly: false,
    eventType: 'AwsServiceEvent',
    managementEvent: true,
    recipientAccountId: '123456789012',
    serviceEventDetails: {
      instanceIdSet: ['i-12345678901234567'],
    },
    eventCategory: 'Management',
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

describe('Handle sport termination interruption warning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not throw or log in error.', async () => {
    const mock = vi.mocked(interruptionWarningHandlerImpl);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });
    await expect(interruptionWarning(spotInstanceInterruptionEvent, context)).resolves.not.toThrow();
  });

  it('should not throw only log in error in case of an exception.', async () => {
    const logSpy = vi.spyOn(logger, 'error');
    const error = new Error('An error.');
    const mock = vi.mocked(interruptionWarningHandlerImpl);
    mock.mockRejectedValue(error);
    await expect(interruptionWarning(spotInstanceInterruptionEvent, context)).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});

describe('Handle sport termination (BidEvictEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not throw or log in error.', async () => {
    const mock = vi.mocked(terminationHandlerImpl);
    mock.mockImplementation(() => {
      return new Promise((resolve) => {
        resolve();
      });
    });
    await expect(termination(bidEvictedEvent, context)).resolves.not.toThrow();
  });

  it('should not throw only log in error in case of an exception.', async () => {
    const logSpy = vi.spyOn(logger, 'error');
    const error = new Error('An error.');
    const mock = vi.mocked(terminationHandlerImpl);
    mock.mockRejectedValue(error);
    await expect(termination(bidEvictedEvent, context)).resolves.toBeUndefined();

    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});

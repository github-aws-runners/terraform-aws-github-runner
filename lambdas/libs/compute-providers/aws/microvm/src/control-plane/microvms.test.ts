import {
  LambdaMicrovmsClient,
  ListMicrovmsCommand,
  ListTagsCommand,
  RunMicrovmCommand,
  TagResourceCommand,
  TerminateMicrovmCommand,
  UntagResourceCommand,
} from '@aws-sdk/client-lambda-microvms';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MicrovmProviderConfig } from './config';
import {
  isRetryableMicrovmError,
  listMicrovmRunners,
  microvmArn,
  microvmBootTimeExceeded,
  runMicrovmRunner,
  tagMicrovm,
  terminateMicrovm,
  untagMicrovm,
} from './microvms';

const mockMicrovmClient = mockClient(LambdaMicrovmsClient);
const imageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner';
const config: MicrovmProviderConfig = {
  imageIdentifier: imageArn,
  imageVersion: '3.0',
  executionRoleArn: 'arn:aws:iam::123456789012:role/microvm-runner',
  egressNetworkConnectors: ['arn:egress'],
  maximumDurationInSeconds: 1200,
  logging: { cloudWatch: { logGroup: '/aws/lambda-microvms/runner' } },
};

beforeEach(() => {
  mockMicrovmClient.reset();
  vi.useRealTimers();
  process.env.AWS_REGION = 'eu-west-1';
  process.env.RUNNER_BOOT_TIME_IN_MINUTES = '5';
});

describe('microvmArn', () => {
  it('derives the MicroVM resource ARN from its image ARN', () => {
    expect(microvmArn(imageArn, 'mvm-123')).toBe('arn:aws:lambda:eu-west-1:123456789012:microvm:mvm-123');
    expect(microvmArn(imageArn.replace('arn:aws:', 'arn:aws-us-gov:'), 'mvm-456')).toContain('arn:aws-us-gov:lambda:');
  });

  it('rejects image names that cannot identify a customer MicroVM resource', () => {
    expect(() => microvmArn('runner', 'mvm-123')).toThrow(
      'MICROVM_IMAGE_ARN is not a valid customer MicroVM image ARN',
    );
  });
});

describe('runMicrovmRunner', () => {
  it('launches and tags a managed runner', async () => {
    mockMicrovmClient.on(RunMicrovmCommand).resolves({ microvmId: 'mvm-123' });
    mockMicrovmClient.on(TagResourceCommand).resolves({});

    await expect(
      runMicrovmRunner({
        config,
        environment: 'unit-test',
        runHookPayload: '{"version":1}',
        runnerOwner: 'Codertocat',
        runnerType: 'Org',
        source: 'scale-up-lambda',
      }),
    ).resolves.toBe('mvm-123');

    expect(mockMicrovmClient).toHaveReceivedCommandWith(RunMicrovmCommand, {
      imageIdentifier: imageArn,
      imageVersion: '3.0',
      executionRoleArn: config.executionRoleArn,
      egressNetworkConnectors: ['arn:egress'],
      maximumDurationInSeconds: 1200,
      logging: config.logging,
      runHookPayload: '{"version":1}',
      clientToken: expect.any(String),
    });
    expect(mockMicrovmClient).toHaveReceivedCommandWith(TagResourceCommand, {
      Resource: microvmArn(imageArn, 'mvm-123'),
      Tags: {
        'ghr:Application': 'github-action-runner',
        'ghr:created_by': 'scale-up-lambda',
        'ghr:environment': 'unit-test',
        'ghr:Owner': 'Codertocat',
        'ghr:Type': 'Org',
      },
    });
  });

  it('rejects a launch response without an ID', async () => {
    mockMicrovmClient.on(RunMicrovmCommand).resolves({});

    await expect(
      runMicrovmRunner({
        config,
        environment: 'unit-test',
        runHookPayload: '{}',
        runnerOwner: 'Codertocat',
        runnerType: 'Org',
        source: 'pool-lambda',
      }),
    ).rejects.toThrow('RunMicrovm returned no microvmId');
  });

  it('terminates a new runner when required tags cannot be applied', async () => {
    const tagError = new Error('tag failed');
    mockMicrovmClient.on(RunMicrovmCommand).resolves({ microvmId: 'mvm-untagged' });
    mockMicrovmClient.on(TagResourceCommand).rejects(tagError);
    mockMicrovmClient.on(TerminateMicrovmCommand).resolves({});

    await expect(
      runMicrovmRunner({
        config,
        environment: 'unit-test',
        runHookPayload: '{}',
        runnerOwner: 'Codertocat',
        runnerType: 'Org',
        source: 'scale-up-lambda',
      }),
    ).rejects.toThrow('tag failed');

    expect(mockMicrovmClient).toHaveReceivedCommandWith(TerminateMicrovmCommand, {
      microvmIdentifier: 'mvm-untagged',
    });
  });

  it('preserves the tag error when cleanup also fails', async () => {
    mockMicrovmClient.on(RunMicrovmCommand).resolves({ microvmId: 'mvm-untagged' });
    mockMicrovmClient.on(TagResourceCommand).rejects(new Error('tag failed'));
    mockMicrovmClient.on(TerminateMicrovmCommand).rejects(new Error('terminate failed'));

    await expect(
      runMicrovmRunner({
        config,
        environment: 'unit-test',
        runHookPayload: '{}',
        runnerOwner: 'Codertocat',
        runnerType: 'Org',
        source: 'scale-up-lambda',
      }),
    ).rejects.toThrow('tag failed');
  });
});

describe('listMicrovmRunners', () => {
  it('paginates active MicroVMs and filters them by management tags', async () => {
    const startedAt = new Date('2026-08-06T10:00:00.000Z');
    mockMicrovmClient
      .on(ListMicrovmsCommand)
      .resolvesOnce({
        nextToken: 'page-2',
        items: [
          { microvmId: 'mvm-managed', imageArn, imageVersion: '3.0', startedAt, state: 'RUNNING' },
          { microvmId: 'mvm-terminated', imageArn, imageVersion: '3.0', startedAt, state: 'TERMINATED' },
        ],
      })
      .resolvesOnce({
        items: [{ microvmId: 'mvm-other', imageArn, imageVersion: '3.0', startedAt, state: 'PENDING' }],
      });
    mockMicrovmClient
      .on(ListTagsCommand)
      .resolvesOnce({
        Tags: {
          'ghr:Application': 'github-action-runner',
          'ghr:environment': 'unit-test',
          'ghr:Owner': 'Codertocat',
          'ghr:Type': 'Org',
          'ghr:github_runner_id': '42',
          'ghr:bypass-removal': 'true',
        },
      })
      .resolvesOnce({ Tags: { 'ghr:Application': 'another-application' } });

    await expect(
      listMicrovmRunners({
        environment: 'unit-test',
        runnerOwner: 'Codertocat',
        runnerType: 'Org',
      }),
    ).resolves.toEqual([
      {
        id: 'mvm-managed',
        imageArn,
        launchTime: startedAt,
        owner: 'Codertocat',
        type: 'Org',
        orphan: false,
        githubRunnerId: '42',
        bypassRemoval: true,
        state: 'RUNNING',
      },
    ]);

    expect(mockMicrovmClient).toHaveReceivedNthCommandWith(2, ListMicrovmsCommand, {
      maxResults: 50,
      nextToken: 'page-2',
    });
  });

  it('applies environment, owner, type, and orphan filters after loading tags', async () => {
    mockMicrovmClient.on(ListMicrovmsCommand).resolves({
      items: [
        {
          microvmId: 'mvm-filtered',
          imageArn,
          imageVersion: '3.0',
          startedAt: new Date(),
          state: 'SUSPENDED',
        },
      ],
    });
    mockMicrovmClient.on(ListTagsCommand).resolves({
      Tags: {
        'ghr:Application': 'github-action-runner',
        'ghr:environment': 'other',
        'ghr:Owner': 'Other',
        'ghr:Type': 'Repo',
      },
    });

    await expect(listMicrovmRunners({ environment: 'unit-test' })).resolves.toEqual([]);
    await expect(listMicrovmRunners({ runnerOwner: 'Codertocat' })).resolves.toEqual([]);
    await expect(listMicrovmRunners({ runnerType: 'Org' })).resolves.toEqual([]);
    await expect(listMicrovmRunners({ orphan: true })).resolves.toEqual([]);
  });

  it('skips a MicroVM that terminates before its tags can be read', async () => {
    const resourceNotFound = Object.assign(new Error('gone'), { name: 'ResourceNotFoundException' });
    mockMicrovmClient.on(ListMicrovmsCommand).resolves({
      items: [{ microvmId: 'mvm-gone', imageArn, imageVersion: '3.0', startedAt: new Date(), state: 'RUNNING' }],
    });
    mockMicrovmClient.on(ListTagsCommand).rejects(resourceNotFound);

    await expect(listMicrovmRunners()).resolves.toEqual([]);
  });

  it('surfaces unexpected tag lookup failures', async () => {
    mockMicrovmClient.on(ListMicrovmsCommand).resolves({
      items: [{ microvmId: 'mvm-error', imageArn, imageVersion: '3.0', startedAt: new Date(), state: 'RUNNING' }],
    });
    mockMicrovmClient.on(ListTagsCommand).rejects(new Error('list tags failed'));

    await expect(listMicrovmRunners()).rejects.toThrow('list tags failed');
  });
});

describe('MicroVM lifecycle helpers', () => {
  it('tags, untags, and terminates a MicroVM', async () => {
    mockMicrovmClient.on(TagResourceCommand).resolves({});
    mockMicrovmClient.on(UntagResourceCommand).resolves({});
    mockMicrovmClient.on(TerminateMicrovmCommand).resolves({});

    await tagMicrovm(imageArn, 'mvm-123', { key: 'value' });
    await untagMicrovm(imageArn, 'mvm-123', ['key']);
    await terminateMicrovm('mvm-123');

    expect(mockMicrovmClient).toHaveReceivedCommandWith(TagResourceCommand, {
      Resource: microvmArn(imageArn, 'mvm-123'),
      Tags: { key: 'value' },
    });
    expect(mockMicrovmClient).toHaveReceivedCommandWith(UntagResourceCommand, {
      Resource: microvmArn(imageArn, 'mvm-123'),
      TagKeys: ['key'],
    });
    expect(mockMicrovmClient).toHaveReceivedCommandWith(TerminateMicrovmCommand, {
      microvmIdentifier: 'mvm-123',
    });
  });

  it('evaluates the configured boot window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-06T10:10:00.000Z'));

    expect(microvmBootTimeExceeded({})).toBe(false);
    expect(microvmBootTimeExceeded({ launchTime: new Date('2026-08-06T10:06:00.000Z') })).toBe(false);
    expect(microvmBootTimeExceeded({ launchTime: new Date('2026-08-06T10:04:00.000Z') })).toBe(true);
  });
});

describe('isRetryableMicrovmError', () => {
  it.each(['ConflictException', 'InternalServerException', 'ServiceQuotaExceededException', 'ThrottlingException'])(
    'classifies %s as retryable',
    (name) => {
      expect(isRetryableMicrovmError(Object.assign(new Error(name), { name }))).toBe(true);
    },
  );

  it('classifies server, throttling, network, and nested failures as retryable', () => {
    expect(isRetryableMicrovmError(Object.assign(new Error('server'), { $fault: 'server' }))).toBe(true);
    expect(isRetryableMicrovmError(Object.assign(new Error('throttle'), { $metadata: { httpStatusCode: 429 } }))).toBe(
      true,
    );
    expect(isRetryableMicrovmError(Object.assign(new Error('network'), { code: 'ECONNRESET' }))).toBe(true);
    expect(
      isRetryableMicrovmError(
        Object.assign(new Error('outer'), { cause: Object.assign(new Error(), { code: 'ETIMEDOUT' }) }),
      ),
    ).toBe(true);
  });

  it('does not retry configuration, unknown, or non-error failures', () => {
    expect(isRetryableMicrovmError(Object.assign(new Error('invalid'), { name: 'ValidationException' }))).toBe(false);
    expect(isRetryableMicrovmError(new Error('unknown'))).toBe(false);
    expect(isRetryableMicrovmError('failure')).toBe(false);
  });
});

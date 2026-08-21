import {
  LambdaMicrovmsClient,
  ListMicrovmsCommand,
  RunMicrovmCommand,
  TerminateMicrovmCommand,
} from '@aws-sdk/client-lambda-microvms';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MicrovmProviderConfig } from './config';
import {
  isRetryableMicrovmError,
  listMicrovmRunners,
  microvmBootTimeExceeded,
  runMicrovmRunner,
  terminateMicrovm,
} from './microvms';
import {
  createMicrovmRunnerMetadata,
  deleteMicrovmRunnerMetadata,
  listMicrovmRunnerMetadata,
  markMicrovmCleanupPending,
  type MicrovmRunnerMetadata,
} from './runner-metadata';

vi.mock('./runner-metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runner-metadata')>()),
  createMicrovmRunnerMetadata: vi.fn(),
  deleteMicrovmRunnerMetadata: vi.fn(),
  listMicrovmRunnerMetadata: vi.fn(),
  markMicrovmCleanupPending: vi.fn(),
}));

const mockMicrovmClient = mockClient(LambdaMicrovmsClient);
const imageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner';
const metadataSsmPath = '/github-action-runners/unit-test/microvm-metadata';
const config: MicrovmProviderConfig = {
  imageIdentifier: imageArn,
  imageVersion: '3.0',
  executionRoleArn: 'arn:aws:iam::123456789012:role/microvm-runner',
  egressNetworkConnectors: ['arn:egress'],
  metadataSsmPath,
  logging: { cloudWatch: { logGroup: '/aws/lambda-microvms/runner' } },
};
const ssmParameterStoreTags = [{ Key: 'CostCenter', Value: '1234' }];

function metadata(overrides: Partial<MicrovmRunnerMetadata> = {}): MicrovmRunnerMetadata {
  return {
    version: 1,
    microvmId: 'mvm-managed',
    environment: 'unit-test',
    runnerOwner: 'Codertocat',
    runnerType: 'Org',
    source: 'scale-up-lambda',
    imageArn,
    imageVersion: '3.0',
    createdAt: '2026-08-06T10:00:00.000Z',
    expiresAt: '2026-08-06T11:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockMicrovmClient.reset();
  vi.clearAllMocks();
  vi.useRealTimers();
  delete process.env.MICROVM_MAXIMUM_DURATION_IN_SECONDS;
  process.env.AWS_REGION = 'eu-west-1';
  process.env.RUNNER_BOOT_TIME_IN_MINUTES = '5';
  vi.mocked(createMicrovmRunnerMetadata).mockResolvedValue();
  vi.mocked(deleteMicrovmRunnerMetadata).mockResolvedValue();
  vi.mocked(listMicrovmRunnerMetadata).mockResolvedValue({ cleanupMicrovmIds: [], metadataById: new Map() });
  vi.mocked(markMicrovmCleanupPending).mockResolvedValue();
});

describe('runMicrovmRunner', () => {
  it('launches a runner for the fixed lifetime and records durable ownership metadata', async () => {
    process.env.MICROVM_MAXIMUM_DURATION_IN_SECONDS = '1200';
    mockMicrovmClient.on(RunMicrovmCommand).resolves({ microvmId: 'mvm-123', imageArn, imageVersion: '3.1' });

    await expect(
      runMicrovmRunner({
        config,
        environment: 'unit-test',
        runHookPayload: '{"version":1}',
        runnerOwner: 'Codertocat',
        runnerType: 'Org',
        ssmParameterStoreTags,
        source: 'scale-up-lambda',
      }),
    ).resolves.toBe('mvm-123');

    expect(mockMicrovmClient).toHaveReceivedCommandWith(RunMicrovmCommand, {
      imageIdentifier: imageArn,
      imageVersion: '3.0',
      executionRoleArn: config.executionRoleArn,
      egressNetworkConnectors: ['arn:egress'],
      maximumDurationInSeconds: 28_800,
      logging: config.logging,
      runHookPayload: '{"version":1}',
      clientToken: expect.any(String),
    });
    expect(createMicrovmRunnerMetadata).toHaveBeenCalledWith(metadataSsmPath, {
      microvmId: 'mvm-123',
      environment: 'unit-test',
      runnerOwner: 'Codertocat',
      runnerType: 'Org',
      source: 'scale-up-lambda',
      imageArn,
      imageVersion: '3.1',
      ssmParameterStoreTags,
    });
  });

  it('rejects invalid metadata tags before launching a MicroVM', async () => {
    await expect(
      runMicrovmRunner({
        config,
        environment: 'unit-test',
        runHookPayload: '{}',
        runnerOwner: 'Codertocat',
        runnerType: 'Org',
        ssmParameterStoreTags: [{ Key: 'aws:microvm:image-arn', Value: imageArn }],
        source: 'scale-up-lambda',
      }),
    ).rejects.toThrow('AWS-reserved tag prefix');
    expect(mockMicrovmClient).not.toHaveReceivedCommand(RunMicrovmCommand);
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
        ssmParameterStoreTags: [],
        source: 'pool-lambda',
      }),
    ).rejects.toThrow('RunMicrovm returned no microvmId');
  });

  it('terminates a new runner when required metadata cannot be recorded', async () => {
    mockMicrovmClient.on(RunMicrovmCommand).resolves({ microvmId: 'mvm-untracked', imageArn });
    mockMicrovmClient.on(TerminateMicrovmCommand).resolves({});
    vi.mocked(createMicrovmRunnerMetadata).mockRejectedValue(new Error('metadata failed'));

    await expect(
      runMicrovmRunner({
        config,
        environment: 'unit-test',
        runHookPayload: '{}',
        runnerOwner: 'Codertocat',
        runnerType: 'Org',
        ssmParameterStoreTags: [],
        source: 'scale-up-lambda',
      }),
    ).rejects.toThrow('metadata failed');

    expect(mockMicrovmClient).toHaveReceivedCommandWith(TerminateMicrovmCommand, {
      microvmIdentifier: 'mvm-untracked',
    });
  });

  it('preserves the metadata error when termination also fails', async () => {
    mockMicrovmClient.on(RunMicrovmCommand).resolves({ microvmId: 'mvm-untracked', imageArn });
    mockMicrovmClient.on(TerminateMicrovmCommand).rejects(new Error('terminate failed'));
    vi.mocked(createMicrovmRunnerMetadata).mockRejectedValue(new Error('metadata failed'));

    await expect(
      runMicrovmRunner({
        config,
        environment: 'unit-test',
        runHookPayload: '{}',
        runnerOwner: 'Codertocat',
        runnerType: 'Org',
        ssmParameterStoreTags: [],
        source: 'scale-up-lambda',
      }),
    ).rejects.toThrow('metadata failed');
    expect(markMicrovmCleanupPending).toHaveBeenCalledWith(metadataSsmPath, 'mvm-untracked');
  });
});

describe('listMicrovmRunners', () => {
  it('paginates active MicroVMs and filters them by durable metadata', async () => {
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
    vi.mocked(listMicrovmRunnerMetadata).mockResolvedValue({
      cleanupMicrovmIds: [],
      metadataById: new Map([
        ['mvm-managed', metadata({ githubRunnerId: '42', bypassRemoval: true })],
        ['mvm-other', metadata({ microvmId: 'mvm-other', runnerOwner: 'Other' })],
      ]),
    });

    await expect(
      listMicrovmRunners(
        {
          environment: 'unit-test',
          runnerOwner: 'Codertocat',
          runnerType: 'Org',
        },
        metadataSsmPath,
      ),
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
    expect(listMicrovmRunnerMetadata).toHaveBeenCalledWith(
      metadataSsmPath,
      new Map([
        ['mvm-managed', 'RUNNING'],
        ['mvm-terminated', 'TERMINATED'],
        ['mvm-other', 'PENDING'],
      ]),
    );
  });

  it('applies environment, owner, type, and orphan filters after loading metadata', async () => {
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
    vi.mocked(listMicrovmRunnerMetadata).mockResolvedValue({
      cleanupMicrovmIds: [],
      metadataById: new Map([
        [
          'mvm-filtered',
          metadata({ microvmId: 'mvm-filtered', environment: 'other', runnerOwner: 'Other', runnerType: 'Repo' }),
        ],
      ]),
    });

    await expect(listMicrovmRunners({ environment: 'unit-test' }, metadataSsmPath)).resolves.toEqual([]);
    await expect(listMicrovmRunners({ runnerOwner: 'Codertocat' }, metadataSsmPath)).resolves.toEqual([]);
    await expect(listMicrovmRunners({ runnerType: 'Org' }, metadataSsmPath)).resolves.toEqual([]);
    await expect(listMicrovmRunners({ orphan: true }, metadataSsmPath)).resolves.toEqual([]);
  });

  it('fails closed for an image mismatch while ignoring unowned MicroVMs', async () => {
    mockMicrovmClient.on(ListMicrovmsCommand).resolves({
      items: [
        { microvmId: 'mvm-missing', imageArn, imageVersion: '3.0', state: 'RUNNING' },
        { microvmId: 'mvm-mismatch', imageArn, imageVersion: '3.0', state: 'RUNNING' },
      ],
    });
    vi.mocked(listMicrovmRunnerMetadata).mockResolvedValue({
      cleanupMicrovmIds: [],
      metadataById: new Map([
        ['mvm-mismatch', metadata({ microvmId: 'mvm-mismatch', imageArn: imageArn.replace(':runner', ':other') })],
      ]),
    });

    await expect(listMicrovmRunners({}, metadataSsmPath)).rejects.toThrow('does not match its metadata');
  });

  it('attempts every pending cleanup and fails inventory closed when a retry fails', async () => {
    const cleanupFailure = new Error('cleanup failed');
    mockMicrovmClient.on(ListMicrovmsCommand).resolves({
      items: [
        { microvmId: 'mvm-first', imageArn, imageVersion: '3.0', state: 'RUNNING' },
        { microvmId: 'mvm-second', imageArn, imageVersion: '3.0', state: 'PENDING' },
      ],
    });
    mockMicrovmClient.on(TerminateMicrovmCommand, { microvmIdentifier: 'mvm-first' }).rejects(cleanupFailure);
    mockMicrovmClient.on(TerminateMicrovmCommand, { microvmIdentifier: 'mvm-second' }).resolves({});
    vi.mocked(listMicrovmRunnerMetadata).mockResolvedValue({
      cleanupMicrovmIds: ['mvm-first', 'mvm-second'],
      metadataById: new Map(),
    });

    await expect(listMicrovmRunners({}, metadataSsmPath)).rejects.toThrow('cleanup failed');
    expect(mockMicrovmClient).toHaveReceivedCommandWith(TerminateMicrovmCommand, {
      microvmIdentifier: 'mvm-first',
    });
    expect(mockMicrovmClient).toHaveReceivedCommandWith(TerminateMicrovmCommand, {
      microvmIdentifier: 'mvm-second',
    });
    expect(markMicrovmCleanupPending).toHaveBeenCalledTimes(2);
  });

  it('surfaces metadata lookup failures instead of reporting zero runners', async () => {
    mockMicrovmClient.on(ListMicrovmsCommand).resolves({
      items: [{ microvmId: 'mvm-error', imageArn, imageVersion: '3.0', state: 'RUNNING' }],
    });
    vi.mocked(listMicrovmRunnerMetadata).mockRejectedValue(new Error('AccessDenied'));

    await expect(listMicrovmRunners({}, metadataSsmPath)).rejects.toThrow('AccessDenied');
  });
});

describe('MicroVM lifecycle helpers', () => {
  it('retains metadata until inventory observes a terminated MicroVM', async () => {
    mockMicrovmClient.on(TerminateMicrovmCommand).resolves({});

    await terminateMicrovm('mvm-123', metadataSsmPath);

    expect(markMicrovmCleanupPending).toHaveBeenCalledWith(metadataSsmPath, 'mvm-123');
    expect(deleteMicrovmRunnerMetadata).not.toHaveBeenCalled();
  });

  it('treats an already terminated MicroVM as successful cleanup', async () => {
    const notFound = Object.assign(new Error('gone'), { name: 'ResourceNotFoundException' });
    mockMicrovmClient.on(TerminateMicrovmCommand).rejects(notFound);

    await expect(terminateMicrovm('mvm-gone', metadataSsmPath)).resolves.toBeUndefined();
    expect(deleteMicrovmRunnerMetadata).toHaveBeenCalledWith(metadataSsmPath, 'mvm-gone');
  });

  it('retains metadata and marks cleanup pending when termination fails', async () => {
    mockMicrovmClient.on(TerminateMicrovmCommand).rejects(new Error('terminate failed'));

    await expect(terminateMicrovm('mvm-123', metadataSsmPath)).rejects.toThrow('terminate failed');
    expect(markMicrovmCleanupPending).toHaveBeenCalledWith(metadataSsmPath, 'mvm-123');
    expect(deleteMicrovmRunnerMetadata).not.toHaveBeenCalled();
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
  it.each([
    'ConflictException',
    'InternalServerException',
    'ServiceQuotaExceededException',
    'ThrottlingException',
    'TooManyUpdates',
  ])('classifies %s as retryable', (name) => {
    expect(isRetryableMicrovmError(Object.assign(new Error(name), { name }))).toBe(true);
  });

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

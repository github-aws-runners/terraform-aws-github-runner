import {
  addParameterTags,
  deleteParameter,
  getParameters,
  getParametersByPath,
  putParameter,
} from '@aws-github-runner/aws-ssm-util';
import type { MicrovmState } from '@aws-sdk/client-lambda-microvms';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertMatchingMicrovmRunnerTokenPath,
  assertSeparatedMicrovmMetadataPath,
  createMicrovmRunnerMetadata,
  deleteMicrovmRunnerJitConfig,
  deleteMicrovmRunnerSsmState,
  listMicrovmRunnerMetadata,
  markMicrovmCleanupPending,
  microvmMetadataParameterName,
  microvmRunnerJitParameterName,
  setMicrovmGithubRunnerMetadata,
  setMicrovmOrphan,
  type MicrovmRunnerMetadata,
} from './runner-metadata';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  addParameterTags: vi.fn(),
  deleteParameter: vi.fn(),
  getParameters: vi.fn(),
  getParametersByPath: vi.fn(),
  putParameter: vi.fn(),
}));

const metadataSsmPath = '/github-action-runners/unit-test/microvm-metadata';
const runnerTokenSsmPath = '/github-action-runners/unit-test/token';
const ssmPaths = { metadataSsmPath, runnerTokenSsmPath };
const launchTags = [
  { Key: 'CostCenter', Value: '1234' },
  { Key: 'ghr:Application', Value: 'github-action-runner' },
  { Key: 'ghr:microvm_id', Value: 'mvm-1' },
];

function metadata(overrides: Partial<MicrovmRunnerMetadata> = {}): MicrovmRunnerMetadata {
  return {
    version: 1,
    microvmId: 'mvm-1',
    environment: 'unit-test',
    runnerOwner: 'Codertocat',
    runnerType: 'Org',
    source: 'scale-up-lambda',
    imageArn: 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner',
    imageVersion: '3.0',
    createdAt: '2026-08-19T10:00:00.000Z',
    expiresAt: '2026-08-19T11:00:00.000Z',
    ...overrides,
  };
}

function states(entries: [string, MicrovmState][]): Map<string, MicrovmState> {
  return new Map(entries);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.mocked(deleteParameter).mockResolvedValue();
  vi.mocked(addParameterTags).mockResolvedValue();
  vi.mocked(getParameters).mockImplementation(async (names) => new Map([[names[0], '{}']]));
  vi.mocked(getParametersByPath).mockResolvedValue(new Map());
  vi.mocked(putParameter).mockResolvedValue();
});

describe('MicroVM metadata paths', () => {
  it('uses one base parameter per validated MicroVM ID', () => {
    expect(microvmMetadataParameterName(`${metadataSsmPath}/`, 'microvm-123')).toBe(`${metadataSsmPath}/microvm-123`);
    expect(() => microvmMetadataParameterName(metadataSsmPath, '../other')).toThrow('Invalid MicroVM identifier');
    expect(microvmRunnerJitParameterName(`${runnerTokenSsmPath}/`, 'microvm-123')).toBe(
      `${runnerTokenSsmPath}/microvm-123`,
    );
    expect(() => microvmRunnerJitParameterName(runnerTokenSsmPath, '../other')).toThrow('Invalid MicroVM identifier');
  });

  it('requires metadata to use a prefix separate from JIT configuration', () => {
    expect(() =>
      assertSeparatedMicrovmMetadataPath(metadataSsmPath, '/github-action-runners/unit-test/token'),
    ).not.toThrow();
    expect(() => assertSeparatedMicrovmMetadataPath('/runner/token/metadata', '/runner/token')).toThrow(
      'must be separate',
    );
    expect(() => assertSeparatedMicrovmMetadataPath('/runner', '/runner/token')).toThrow('must be separate');
    expect(() => assertMatchingMicrovmRunnerTokenPath(`${runnerTokenSsmPath}/`, runnerTokenSsmPath)).not.toThrow();
    expect(() => assertMatchingMicrovmRunnerTokenPath('/runner/other-token', runnerTokenSsmPath)).toThrow(
      'must match the runner JIT token path',
    );
  });
});

describe('MicroVM metadata lifecycle', () => {
  it('creates non-secret, expiring ownership metadata without overwrite', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T10:00:00.000Z'));

    const createdTags = await createMicrovmRunnerMetadata(metadataSsmPath, {
      microvmId: 'mvm-1',
      environment: 'unit-test',
      runnerOwner: 'Codertocat',
      runnerType: 'Org',
      source: 'scale-up-lambda',
      imageArn: 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner',
      imageVersion: '3.0',
      ssmParameterStoreTags: [
        { Key: 'CostCenter', Value: '1234' },
        { Key: 'Name', Value: 'not-used-for-microvm-metadata' },
        { Key: 'ghr:Owner', Value: 'configured-owner-cannot-win' },
        { Key: 'ghr:created_by', Value: 'configured-source-cannot-win' },
        { Key: 'ghr:environment', Value: 'unit-test' },
        { Key: 'ghr:runner_name_prefix', Value: 'unit-test-' },
        { Key: 'ghr:ssm_config_path', Value: '/github-action-runners/unit-test/config' },
        { Key: 'ghr:github_runner_id', Value: 'configured-id-is-not-launch-metadata' },
        { Key: 'ghr:runner_labels', Value: 'configured-labels-are-not-launch-metadata' },
      ],
    });

    expect(putParameter).toHaveBeenCalledWith(
      `${metadataSsmPath}/mvm-1`,
      JSON.stringify(metadata({ expiresAt: '2026-08-19T18:05:00.000Z' })),
      false,
      {
        tags: [
          { Key: 'CostCenter', Value: '1234' },
          { Key: 'ghr:Owner', Value: 'Codertocat' },
          { Key: 'ghr:created_by', Value: 'scale-up-lambda' },
          { Key: 'ghr:environment', Value: 'unit-test' },
          { Key: 'ghr:runner_name_prefix', Value: 'unit-test-' },
          { Key: 'ghr:ssm_config_path', Value: '/github-action-runners/unit-test/config' },
          { Key: 'ghr:Application', Value: 'github-action-runner' },
          { Key: 'ghr:Type', Value: 'Org' },
          { Key: 'ghr:microvm_id', Value: 'mvm-1' },
          {
            Key: 'ghr:microvm_image_arn',
            Value: 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner',
          },
          { Key: 'ghr:microvm_image_version', Value: '3.0' },
        ],
      },
    );
    expect(createdTags).toEqual(vi.mocked(putParameter).mock.calls[0][3]?.tags);
  });

  it('rejects reserved tag keys and preserves room for late GitHub metadata', async () => {
    const input = {
      microvmId: 'mvm-1',
      environment: 'unit-test',
      runnerOwner: 'Codertocat',
      runnerType: 'Org' as const,
      source: 'scale-up-lambda' as const,
      imageArn: 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner',
      imageVersion: '3.0',
      ssmParameterStoreTags: [],
    };

    await expect(
      createMicrovmRunnerMetadata(metadataSsmPath, {
        ...input,
        ssmParameterStoreTags: [{ Key: 'aws:microvm:image-arn', Value: input.imageArn }],
      }),
    ).rejects.toThrow('AWS-reserved tag prefix');

    await expect(
      createMicrovmRunnerMetadata(metadataSsmPath, {
        ...input,
        ssmParameterStoreTags: Array.from({ length: 37 }, (_, index) => ({
          Key: `Custom${index}`,
          Value: 'value',
        })),
      }),
    ).rejects.toThrow('cannot have more than 44 launch tags');
    expect(putParameter).not.toHaveBeenCalled();
  });

  it('rejects launch tags whose complete serialized metadata could exceed the Parameter Store value limit', async () => {
    await expect(
      createMicrovmRunnerMetadata(metadataSsmPath, {
        microvmId: 'mvm-1',
        environment: 'unit-test',
        runnerOwner: 'Codertocat',
        runnerType: 'Org',
        source: 'scale-up-lambda',
        imageArn: 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner',
        imageVersion: '3.0',
        ssmParameterStoreTags: Array.from({ length: 20 }, (_, index) => ({
          Key: `Custom${index}${'k'.repeat(100)}`,
          Value: 'v'.repeat(256),
        })),
      }),
    ).rejects.toThrow('cannot exceed 8192 bytes when serialized');
    expect(putParameter).not.toHaveBeenCalled();
  });

  it('loads active metadata and schedules expired or invalid inactive records for two-phase cleanup', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
    const active = metadata({ expiresAt: '2026-08-19T12:30:00.000Z' });
    const expiredInactive = metadata({ microvmId: 'mvm-old', expiresAt: '2026-08-19T11:00:00.000Z' });
    const unexpiredInactive = metadata({ microvmId: 'mvm-new', expiresAt: '2026-08-19T12:30:00.000Z' });
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([
        [`${metadataSsmPath}/mvm-1`, JSON.stringify(active)],
        [`${metadataSsmPath}/mvm-1.github-runner-id`, 'github-42'],
        [`${metadataSsmPath}/mvm-1.orphan`, 'true'],
        [`${metadataSsmPath}/mvm-old`, JSON.stringify(expiredInactive)],
        [`${metadataSsmPath}/mvm-new`, JSON.stringify(unexpiredInactive)],
        [`${metadataSsmPath}/mvm-invalid`, '{not-json'],
      ]),
    );

    await expect(listMicrovmRunnerMetadata(ssmPaths, states([['mvm-1', 'RUNNING']]))).resolves.toEqual({
      cleanupMicrovmIds: ['mvm-old', 'mvm-invalid'],
      metadataById: new Map([['mvm-1', { ...active, githubRunnerId: 'github-42', orphan: true }]]),
    });
    expect(getParametersByPath).toHaveBeenCalledWith(metadataSsmPath);
    expect(deleteParameter).not.toHaveBeenCalled();
    expect(deleteParameter).not.toHaveBeenCalledWith(`${metadataSsmPath}/mvm-new`);
  });

  it('fails closed for invalid ownership metadata belonging to an active MicroVM', async () => {
    vi.mocked(getParametersByPath).mockResolvedValue(new Map([[`${metadataSsmPath}/mvm-1`, '{not-json']]));
    await expect(listMicrovmRunnerMetadata(ssmPaths, states([['mvm-1', 'RUNNING']]))).rejects.toThrow(
      'invalid ownership metadata',
    );
  });

  it('schedules provider-owned metadata with invalid orphan state for two-phase cleanup', async () => {
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([
        [`${metadataSsmPath}/mvm-1`, JSON.stringify(metadata())],
        [`${metadataSsmPath}/mvm-1.orphan`, 'invalid'],
      ]),
    );
    await expect(listMicrovmRunnerMetadata(ssmPaths, states([['mvm-1', 'RUNNING']]))).resolves.toEqual({
      cleanupMicrovmIds: ['mvm-1'],
      metadataById: new Map(),
    });
  });

  it('propagates metadata path lookup errors so inventory fails closed', async () => {
    vi.mocked(getParametersByPath).mockRejectedValue(new Error('AccessDenied'));

    await expect(listMicrovmRunnerMetadata(ssmPaths, states([['mvm-1', 'RUNNING']]))).rejects.toThrow('AccessDenied');
  });

  it('updates GitHub state and adds late GitHub metadata tags to the base parameter', async () => {
    const runnerLabels = ['self-hosted', 'linux', 'env:unit-test'];
    await setMicrovmGithubRunnerMetadata(
      ssmPaths,
      'mvm-1',
      {
        githubRunnerId: 'github-42',
        runnerLabels,
      },
      launchTags,
    );
    expect(putParameter).toHaveBeenCalledWith(`${metadataSsmPath}/mvm-1.github-runner-id`, 'github-42', false, {
      overwrite: true,
    });
    expect(putParameter).toHaveBeenCalledWith(`${metadataSsmPath}/mvm-1.tags`, expect.any(String), false, {
      overwrite: true,
    });
    const tagsValue = vi.mocked(putParameter).mock.calls.find(([name]) => name.endsWith('.tags'))?.[1];
    expect(JSON.parse(tagsValue ?? '{}')).toEqual({
      CostCenter: '1234',
      'ghr:Application': 'github-action-runner',
      'ghr:github_runner_id': 'github-42',
      'ghr:microvm_id': 'mvm-1',
      'ghr:runner_labels': `base64url:${Buffer.from(JSON.stringify(runnerLabels), 'utf8').toString('base64url')}`,
    });
    expect(addParameterTags).toHaveBeenCalledWith(`${metadataSsmPath}/mvm-1`, [
      { Key: 'ghr:github_runner_id', Value: 'github-42' },
      {
        Key: 'ghr:runner_labels',
        Value: `base64url:${Buffer.from(JSON.stringify(runnerLabels), 'utf8').toString('base64url')}`,
      },
    ]);
  });

  it('revokes JIT configuration when cleanup starts before late metadata is recorded', async () => {
    vi.mocked(getParameters).mockResolvedValue(
      new Map([
        [`${metadataSsmPath}/mvm-1`, '{}'],
        [`${metadataSsmPath}/mvm-1.cleanup-requested-at`, '2026-08-19T12:00:00.000Z'],
      ]),
    );

    await expect(
      setMicrovmGithubRunnerMetadata(ssmPaths, 'mvm-1', { githubRunnerId: 'github-42', runnerLabels: [] }, launchTags),
    ).rejects.toThrow('no longer accepting JIT configuration');
    expect(deleteParameter).toHaveBeenCalledWith(`${runnerTokenSsmPath}/mvm-1`);
    expect(putParameter).not.toHaveBeenCalled();
  });

  it('revokes JIT configuration when ownership metadata is already absent', async () => {
    vi.mocked(getParameters).mockResolvedValue(new Map());

    await expect(
      setMicrovmGithubRunnerMetadata(ssmPaths, 'mvm-1', { githubRunnerId: 'github-42', runnerLabels: [] }, launchTags),
    ).rejects.toThrow('no longer accepting JIT configuration');
    expect(deleteParameter).toHaveBeenCalledWith(`${runnerTokenSsmPath}/mvm-1`);
    expect(putParameter).not.toHaveBeenCalled();
  });

  it('revokes JIT configuration when the post-write ownership fence cannot be read', async () => {
    vi.mocked(getParameters).mockRejectedValue(new Error('AccessDenied'));

    await expect(
      setMicrovmGithubRunnerMetadata(ssmPaths, 'mvm-1', { githubRunnerId: 'github-42', runnerLabels: [] }, launchTags),
    ).rejects.toThrow('AccessDenied');
    expect(deleteParameter).toHaveBeenCalledWith(`${runnerTokenSsmPath}/mvm-1`);
    expect(putParameter).not.toHaveBeenCalled();
  });

  it('splits encoded runner labels into SSM-safe tag values', async () => {
    const runnerLabels = [`label-${'a'.repeat(140)}`, `label-${'b'.repeat(140)}`];

    await setMicrovmGithubRunnerMetadata(
      ssmPaths,
      'mvm-1',
      {
        githubRunnerId: 'github-42',
        runnerLabels,
      },
      launchTags,
    );

    expect(addParameterTags).toHaveBeenCalledWith(`${metadataSsmPath}/mvm-1`, [
      { Key: 'ghr:github_runner_id', Value: 'github-42' },
      {
        Key: 'ghr:runner_labels',
        Value: `base64url:${Buffer.from(JSON.stringify([runnerLabels[0]]), 'utf8').toString('base64url')}`,
      },
      {
        Key: 'ghr:runner_labels:2',
        Value: `base64url:${Buffer.from(JSON.stringify([runnerLabels[1]]), 'utf8').toString('base64url')}`,
      },
    ]);
  });

  it('keeps the GitHub runner ID tag when a runner label is too large', async () => {
    await setMicrovmGithubRunnerMetadata(
      ssmPaths,
      'mvm-1',
      {
        githubRunnerId: 'github-42',
        runnerLabels: ['x'.repeat(300)],
      },
      launchTags,
    );

    expect(addParameterTags).toHaveBeenCalledWith(`${metadataSsmPath}/mvm-1`, [
      { Key: 'ghr:github_runner_id', Value: 'github-42' },
    ]);
  });

  it('keeps the durable GitHub runner ID when late metadata tagging fails', async () => {
    vi.mocked(addParameterTags).mockRejectedValue(new Error('AccessDenied'));

    await expect(
      setMicrovmGithubRunnerMetadata(
        ssmPaths,
        'mvm-1',
        {
          githubRunnerId: 'github-42',
          runnerLabels: [],
        },
        launchTags,
      ),
    ).resolves.toBeUndefined();
    expect(putParameter).toHaveBeenCalledWith(`${metadataSsmPath}/mvm-1.github-runner-id`, 'github-42', false, {
      overwrite: true,
    });
  });

  it('fails JIT setup when the canonical tag-value parameter cannot be written', async () => {
    vi.mocked(putParameter).mockImplementation(async (name) => {
      if (name.endsWith('.tags')) throw new Error('AccessDenied');
    });

    await expect(
      setMicrovmGithubRunnerMetadata(ssmPaths, 'mvm-1', { githubRunnerId: 'github-42', runnerLabels: [] }, launchTags),
    ).rejects.toThrow('AccessDenied');
    expect(addParameterTags).not.toHaveBeenCalled();
  });

  it('updates orphan state without a shared read-modify-write record', async () => {
    await setMicrovmOrphan(metadataSsmPath, 'mvm-1', true);
    expect(putParameter).toHaveBeenLastCalledWith(`${metadataSsmPath}/mvm-1.orphan`, 'true', false, {
      overwrite: true,
    });
  });

  it('marks cleanup independently and deletes JIT plus metadata while retaining the tombstone until last', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));

    await markMicrovmCleanupPending(metadataSsmPath, 'mvm-1');
    expect(putParameter).toHaveBeenCalledWith(
      `${metadataSsmPath}/mvm-1.cleanup-requested-at`,
      '2026-08-19T12:00:00.000Z',
      false,
    );

    await deleteMicrovmRunnerSsmState(ssmPaths, 'mvm-1');
    expect(vi.mocked(deleteParameter).mock.calls.map(([name]) => name)).toEqual([
      `${runnerTokenSsmPath}/mvm-1`,
      `${metadataSsmPath}/mvm-1.github-runner-id`,
      `${metadataSsmPath}/mvm-1.orphan`,
      `${metadataSsmPath}/mvm-1.tags`,
      `${metadataSsmPath}/mvm-1`,
      `${metadataSsmPath}/mvm-1.cleanup-requested-at`,
    ]);
  });

  it('does not reset the cleanup grace window when its tombstone already exists', async () => {
    vi.mocked(putParameter).mockRejectedValueOnce(
      Object.assign(new Error('ParameterAlreadyExists'), { __type: 'ParameterAlreadyExists' }),
    );

    await expect(markMicrovmCleanupPending(metadataSsmPath, 'mvm-1')).resolves.toBeUndefined();
    expect(putParameter).toHaveBeenCalledOnce();
  });

  it('continues deleting metadata when optional parameters are already absent', async () => {
    vi.mocked(deleteParameter)
      .mockRejectedValueOnce(
        Object.assign(new Error('ParameterNotFound'), {
          __type: 'ParameterNotFound',
          $fault: 'client',
          $metadata: { httpStatusCode: 400 },
        }),
      )
      .mockRejectedValueOnce(Object.assign(new Error('missing parameter'), { name: 'ParameterNotFound' }));

    await expect(deleteMicrovmRunnerSsmState(ssmPaths, 'mvm-1')).resolves.toBeUndefined();
    expect(vi.mocked(deleteParameter).mock.calls.map(([name]) => name)).toEqual([
      `${runnerTokenSsmPath}/mvm-1`,
      `${metadataSsmPath}/mvm-1.github-runner-id`,
      `${metadataSsmPath}/mvm-1.orphan`,
      `${metadataSsmPath}/mvm-1.tags`,
      `${metadataSsmPath}/mvm-1`,
      `${metadataSsmPath}/mvm-1.cleanup-requested-at`,
    ]);
  });

  it('propagates metadata deletion failures other than missing parameters', async () => {
    const error = Object.assign(new Error('AccessDeniedException'), {
      __type: 'AccessDeniedException',
      $fault: 'client',
      $metadata: { httpStatusCode: 400 },
    });
    vi.mocked(deleteParameter).mockRejectedValueOnce(error);

    await expect(deleteMicrovmRunnerSsmState(ssmPaths, 'mvm-1')).rejects.toBe(error);
    expect(deleteParameter).toHaveBeenCalledTimes(1);
  });

  it('deletes only the lane JIT parameter when revoking pending runner configuration', async () => {
    await deleteMicrovmRunnerJitConfig(runnerTokenSsmPath, 'mvm-1');

    expect(deleteParameter).toHaveBeenCalledOnce();
    expect(deleteParameter).toHaveBeenCalledWith(`${runnerTokenSsmPath}/mvm-1`);
  });

  it('returns tracked and state-only active cleanup requests for termination retry', async () => {
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([
        [`${metadataSsmPath}/mvm-1`, JSON.stringify(metadata())],
        [`${metadataSsmPath}/mvm-1.github-runner-id`, 'github-42'],
        [`${metadataSsmPath}/mvm-1.cleanup-requested-at`, '2026-08-19T10:15:00.000Z'],
        [`${metadataSsmPath}/mvm-untracked.cleanup-requested-at`, '2026-08-19T10:15:00.000Z'],
        [`${metadataSsmPath}/mvm-terminating.cleanup-requested-at`, '2026-08-19T10:15:00.000Z'],
      ]),
    );

    await expect(
      listMicrovmRunnerMetadata(
        ssmPaths,
        states([
          ['mvm-1', 'RUNNING'],
          ['mvm-untracked', 'PENDING'],
          ['mvm-terminating', 'TERMINATING'],
        ]),
      ),
    ).resolves.toEqual({
      cleanupMicrovmIds: ['mvm-1', 'mvm-untracked'],
      metadataById: new Map(),
    });
    expect(deleteParameter).not.toHaveBeenCalled();
  });

  it('does not starve cleanup requests when more than one reconciliation batch is pending', async () => {
    const cleanupIds = Array.from({ length: 11 }, (_, index) => `mvm-cleanup-${index}`);
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map(
        cleanupIds.map((microvmId) => [
          `${metadataSsmPath}/${microvmId}.cleanup-requested-at`,
          '2026-08-19T10:15:00.000Z',
        ]),
      ),
    );

    await expect(
      listMicrovmRunnerMetadata(
        ssmPaths,
        states(cleanupIds.map((microvmId): [string, MicrovmState] => [microvmId, 'RUNNING'])),
      ),
    ).resolves.toEqual({ cleanupMicrovmIds: cleanupIds, metadataById: new Map() });
  });

  it('keeps cleanup discoverable through the grace window before deleting JIT and every metadata record', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([
        [`${metadataSsmPath}/mvm-terminal.github-runner-id`, 'github-42'],
        [`${metadataSsmPath}/mvm-missing.cleanup-requested-at`, '2026-08-19T11:54:59.000Z'],
        [`${metadataSsmPath}/mvm-missing.tags`, '{"ghr:microvm_id":"mvm-missing"}'],
        [`${metadataSsmPath}/mvm-recent.cleanup-requested-at`, '2026-08-19T11:59:00.000Z'],
        [`${metadataSsmPath}/mvm-recent.tags`, '{"ghr:microvm_id":"mvm-recent"}'],
      ]),
    );

    await expect(listMicrovmRunnerMetadata(ssmPaths, states([['mvm-terminal', 'TERMINATED']]))).resolves.toEqual({
      cleanupMicrovmIds: ['mvm-terminal', 'mvm-recent'],
      metadataById: new Map(),
    });
    expect(deleteParameter).toHaveBeenCalledTimes(6);
    expect(deleteParameter).toHaveBeenCalledWith(`${runnerTokenSsmPath}/mvm-missing`);
    expect(deleteParameter).toHaveBeenCalledWith(`${metadataSsmPath}/mvm-missing`);
    expect(deleteParameter).toHaveBeenCalledWith(`${metadataSsmPath}/mvm-missing.tags`);
    expect(deleteParameter).toHaveBeenLastCalledWith(`${metadataSsmPath}/mvm-missing.cleanup-requested-at`);
    expect(deleteParameter).not.toHaveBeenCalledWith(`${runnerTokenSsmPath}/mvm-terminal`);
    expect(deleteParameter).not.toHaveBeenCalledWith(`${runnerTokenSsmPath}/mvm-recent`);
    expect(deleteParameter).not.toHaveBeenCalledWith(`${metadataSsmPath}/mvm-recent`);
  });

  it('deletes invalid ownership metadata after its valid cleanup tombstone ages', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([
        [`${metadataSsmPath}/mvm-invalid`, '{not-json'],
        [`${metadataSsmPath}/mvm-invalid.cleanup-requested-at`, '2026-08-19T11:54:59.000Z'],
      ]),
    );

    await expect(listMicrovmRunnerMetadata(ssmPaths, new Map())).resolves.toEqual({
      cleanupMicrovmIds: [],
      metadataById: new Map(),
    });
    expect(vi.mocked(deleteParameter).mock.calls.map(([name]) => name)).toEqual([
      `${runnerTokenSsmPath}/mvm-invalid`,
      `${metadataSsmPath}/mvm-invalid.github-runner-id`,
      `${metadataSsmPath}/mvm-invalid.orphan`,
      `${metadataSsmPath}/mvm-invalid.tags`,
      `${metadataSsmPath}/mvm-invalid`,
      `${metadataSsmPath}/mvm-invalid.cleanup-requested-at`,
    ]);
  });

  it('repairs an invalid cleanup timestamp before recreating the two-phase cleanup marker', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([
        [`${metadataSsmPath}/mvm-1`, JSON.stringify(metadata())],
        [`${metadataSsmPath}/mvm-1.cleanup-requested-at`, 'not-a-timestamp'],
      ]),
    );

    await expect(listMicrovmRunnerMetadata(ssmPaths, states([['mvm-1', 'TERMINATED']]))).resolves.toEqual({
      cleanupMicrovmIds: ['mvm-1'],
      metadataById: new Map(),
    });
    expect(deleteParameter).toHaveBeenCalledOnce();
    expect(deleteParameter).toHaveBeenCalledWith(`${metadataSsmPath}/mvm-1.cleanup-requested-at`);

    await markMicrovmCleanupPending(metadataSsmPath, 'mvm-1');
    expect(putParameter).toHaveBeenCalledWith(
      `${metadataSsmPath}/mvm-1.cleanup-requested-at`,
      '2026-08-19T12:00:00.000Z',
      false,
    );

    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-08-19T12:06:00.000Z'));
    vi.mocked(deleteParameter).mockResolvedValue();
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([
        [`${metadataSsmPath}/mvm-1`, JSON.stringify(metadata())],
        [`${metadataSsmPath}/mvm-1.cleanup-requested-at`, '2026-08-19T12:00:00.000Z'],
      ]),
    );

    await expect(listMicrovmRunnerMetadata(ssmPaths, states([['mvm-1', 'TERMINATED']]))).resolves.toEqual({
      cleanupMicrovmIds: [],
      metadataById: new Map(),
    });
    expect(deleteParameter).toHaveBeenCalledTimes(6);
  });

  it('marks a terminal tags-only companion for two-phase cleanup instead of deleting it immediately', async () => {
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([[`${metadataSsmPath}/mvm-tags-only.tags`, '{"ghr:microvm_id":"mvm-tags-only"}']]),
    );

    await expect(listMicrovmRunnerMetadata(ssmPaths, states([['mvm-tags-only', 'TERMINATED']]))).resolves.toEqual({
      cleanupMicrovmIds: ['mvm-tags-only'],
      metadataById: new Map(),
    });
    expect(deleteParameter).not.toHaveBeenCalled();
  });

  it('fails closed for active state metadata without ownership or a cleanup request', async () => {
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([[`${metadataSsmPath}/mvm-1.github-runner-id`, 'github-42']]),
    );

    await expect(listMicrovmRunnerMetadata(ssmPaths, states([['mvm-1', 'RUNNING']]))).rejects.toThrow(
      'state metadata but no ownership metadata',
    );
  });
});

import { deleteParameter, getParametersByPath, putParameter } from '@aws-github-runner/aws-ssm-util';
import type { MicrovmState } from '@aws-sdk/client-lambda-microvms';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assertSeparatedMicrovmMetadataPath,
  createMicrovmRunnerMetadata,
  deleteMicrovmRunnerMetadata,
  listMicrovmRunnerMetadata,
  markMicrovmCleanupPending,
  microvmMetadataParameterName,
  setMicrovmGithubRunnerId,
  setMicrovmOrphan,
  type MicrovmRunnerMetadata,
} from './runner-metadata';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  deleteParameter: vi.fn(),
  getParametersByPath: vi.fn(),
  putParameter: vi.fn(),
}));

const metadataSsmPath = '/github-action-runners/unit-test/microvm-metadata';

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
  vi.mocked(getParametersByPath).mockResolvedValue(new Map());
  vi.mocked(putParameter).mockResolvedValue();
});

describe('MicroVM metadata paths', () => {
  it('uses one base parameter per validated MicroVM ID', () => {
    expect(microvmMetadataParameterName(`${metadataSsmPath}/`, 'microvm-123')).toBe(`${metadataSsmPath}/microvm-123`);
    expect(() => microvmMetadataParameterName(metadataSsmPath, '../other')).toThrow('Invalid MicroVM identifier');
  });

  it('requires metadata to use a prefix separate from JIT configuration', () => {
    expect(() =>
      assertSeparatedMicrovmMetadataPath(metadataSsmPath, '/github-action-runners/unit-test/token'),
    ).not.toThrow();
    expect(() => assertSeparatedMicrovmMetadataPath('/runner/token/metadata', '/runner/token')).toThrow(
      'must be separate',
    );
    expect(() => assertSeparatedMicrovmMetadataPath('/runner', '/runner/token')).toThrow('must be separate');
  });
});

describe('MicroVM metadata lifecycle', () => {
  it('creates non-secret, expiring ownership metadata without overwrite', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T10:00:00.000Z'));

    await createMicrovmRunnerMetadata(metadataSsmPath, {
      microvmId: 'mvm-1',
      environment: 'unit-test',
      runnerOwner: 'Codertocat',
      runnerType: 'Org',
      source: 'scale-up-lambda',
      imageArn: 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner',
      imageVersion: '3.0',
      maximumDurationInSeconds: 1200,
    });

    expect(putParameter).toHaveBeenCalledWith(
      `${metadataSsmPath}/mvm-1`,
      JSON.stringify(metadata({ expiresAt: '2026-08-19T10:25:00.000Z' })),
      false,
    );
  });

  it('loads active metadata with independent state and cleans expired inactive records', async () => {
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

    await expect(listMicrovmRunnerMetadata(metadataSsmPath, states([['mvm-1', 'RUNNING']]))).resolves.toEqual({
      cleanupMicrovmIds: [],
      metadataById: new Map([['mvm-1', { ...active, githubRunnerId: 'github-42', orphan: true }]]),
    });
    expect(getParametersByPath).toHaveBeenCalledWith(metadataSsmPath);
    expect(deleteParameter).toHaveBeenCalledTimes(4);
    expect(deleteParameter).toHaveBeenLastCalledWith(`${metadataSsmPath}/mvm-old`);
    expect(deleteParameter).not.toHaveBeenCalledWith(`${metadataSsmPath}/mvm-new`);
  });

  it('fails closed for invalid metadata or state belonging to an active MicroVM', async () => {
    vi.mocked(getParametersByPath).mockResolvedValue(new Map([[`${metadataSsmPath}/mvm-1`, '{not-json']]));
    await expect(listMicrovmRunnerMetadata(metadataSsmPath, states([['mvm-1', 'RUNNING']]))).rejects.toThrow(
      'invalid ownership metadata',
    );

    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([
        [`${metadataSsmPath}/mvm-1`, JSON.stringify(metadata())],
        [`${metadataSsmPath}/mvm-1.orphan`, 'invalid'],
      ]),
    );
    await expect(listMicrovmRunnerMetadata(metadataSsmPath, states([['mvm-1', 'RUNNING']]))).rejects.toThrow(
      'invalid orphan state',
    );
  });

  it('propagates metadata path lookup errors so inventory fails closed', async () => {
    vi.mocked(getParametersByPath).mockRejectedValue(new Error('AccessDenied'));

    await expect(listMicrovmRunnerMetadata(metadataSsmPath, states([['mvm-1', 'RUNNING']]))).rejects.toThrow(
      'AccessDenied',
    );
  });

  it('updates GitHub and orphan state without a shared read-modify-write record', async () => {
    await setMicrovmGithubRunnerId(metadataSsmPath, 'mvm-1', 'github-42');
    expect(putParameter).toHaveBeenLastCalledWith(`${metadataSsmPath}/mvm-1.github-runner-id`, 'github-42', false, {
      overwrite: true,
    });

    await setMicrovmOrphan(metadataSsmPath, 'mvm-1', true);
    expect(putParameter).toHaveBeenLastCalledWith(`${metadataSsmPath}/mvm-1.orphan`, 'true', false, {
      overwrite: true,
    });
  });

  it('marks cleanup independently and deletes state before ownership metadata', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));

    await markMicrovmCleanupPending(metadataSsmPath, 'mvm-1');
    expect(putParameter).toHaveBeenCalledWith(
      `${metadataSsmPath}/mvm-1.cleanup-requested-at`,
      '2026-08-19T12:00:00.000Z',
      false,
      { overwrite: true },
    );

    await deleteMicrovmRunnerMetadata(metadataSsmPath, 'mvm-1');
    expect(vi.mocked(deleteParameter).mock.calls.map(([name]) => name)).toEqual([
      `${metadataSsmPath}/mvm-1.github-runner-id`,
      `${metadataSsmPath}/mvm-1.orphan`,
      `${metadataSsmPath}/mvm-1.cleanup-requested-at`,
      `${metadataSsmPath}/mvm-1`,
    ]);
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

    await expect(deleteMicrovmRunnerMetadata(metadataSsmPath, 'mvm-1')).resolves.toBeUndefined();
    expect(vi.mocked(deleteParameter).mock.calls.map(([name]) => name)).toEqual([
      `${metadataSsmPath}/mvm-1.github-runner-id`,
      `${metadataSsmPath}/mvm-1.orphan`,
      `${metadataSsmPath}/mvm-1.cleanup-requested-at`,
      `${metadataSsmPath}/mvm-1`,
    ]);
  });

  it('propagates metadata deletion failures other than missing parameters', async () => {
    const error = Object.assign(new Error('AccessDeniedException'), {
      __type: 'AccessDeniedException',
      $fault: 'client',
      $metadata: { httpStatusCode: 400 },
    });
    vi.mocked(deleteParameter).mockRejectedValueOnce(error);

    await expect(deleteMicrovmRunnerMetadata(metadataSsmPath, 'mvm-1')).rejects.toBe(error);
    expect(deleteParameter).toHaveBeenCalledTimes(1);
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
        metadataSsmPath,
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
        metadataSsmPath,
        states(cleanupIds.map((microvmId): [string, MicrovmState] => [microvmId, 'RUNNING'])),
      ),
    ).resolves.toEqual({ cleanupMicrovmIds: cleanupIds, metadataById: new Map() });
  });

  it('cleans terminal state-only records and aged markers after inventory no longer sees the MicroVM', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-19T12:00:00.000Z'));
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([
        [`${metadataSsmPath}/mvm-terminal.github-runner-id`, 'github-42'],
        [`${metadataSsmPath}/mvm-missing.cleanup-requested-at`, '2026-08-19T11:54:59.000Z'],
        [`${metadataSsmPath}/mvm-recent.cleanup-requested-at`, '2026-08-19T11:59:00.000Z'],
      ]),
    );

    await expect(listMicrovmRunnerMetadata(metadataSsmPath, states([['mvm-terminal', 'TERMINATED']]))).resolves.toEqual(
      { cleanupMicrovmIds: [], metadataById: new Map() },
    );
    expect(deleteParameter).toHaveBeenCalledTimes(8);
    expect(deleteParameter).toHaveBeenCalledWith(`${metadataSsmPath}/mvm-terminal`);
    expect(deleteParameter).toHaveBeenCalledWith(`${metadataSsmPath}/mvm-missing`);
    expect(deleteParameter).not.toHaveBeenCalledWith(`${metadataSsmPath}/mvm-recent`);
  });

  it('fails closed for active state metadata without ownership or a cleanup request', async () => {
    vi.mocked(getParametersByPath).mockResolvedValue(
      new Map([[`${metadataSsmPath}/mvm-1.github-runner-id`, 'github-42']]),
    );

    await expect(listMicrovmRunnerMetadata(metadataSsmPath, states([['mvm-1', 'RUNNING']]))).rejects.toThrow(
      'state metadata but no ownership metadata',
    );
  });
});

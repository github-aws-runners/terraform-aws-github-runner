import type { RunnerScaleSetMessage, RunnerScaleSetStatistic } from '@aws-github-runner/github-actions-scale-set';
import { ScaleSetHttpError } from '@aws-github-runner/github-actions-scale-set';
import type { ScaleSetRunnerConfig } from '@aws-github-runner/compute-providers/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  calculateScaleSetTarget,
  createScaleSetPollState,
  pollScaleSetOnce,
  runScaleSetPollLoop,
  ScaleSetReconciliationError,
  type ScaleSetApiClient,
  type ScaleSetMessageSession,
  type ScaleSetOrchestratorConfig,
  type ScaleSetPollState,
  type ScaleSetProvider,
} from './orchestrator';

const runnerConfig: Omit<ScaleSetRunnerConfig, 'scaleSetId'> = {
  runnerNamePrefix: 'scale-set-',
  runnerOwner: 'octo-org',
  runnerType: 'Org',
  ssmTokenPath: '/github-action-runners/default/runners/config',
  ssmParameterStoreTags: [{ Key: 'Environment', Value: 'unit-test' }],
};

const config: ScaleSetOrchestratorConfig = {
  scaleSetId: 123,
  minRunners: 2,
  maxRunners: 5,
  runnerConfig,
  workFolder: '_work',
};

function statistics(totalAssignedJobs: number): RunnerScaleSetStatistic {
  return {
    totalAvailableJobs: 0,
    totalAcquiredJobs: 0,
    totalAssignedJobs,
    totalRunningJobs: 0,
    totalRegisteredRunners: 0,
    totalBusyRunners: 0,
    totalIdleRunners: 0,
  };
}

function message(
  messageId: number,
  messageStatistics: RunnerScaleSetStatistic | null,
  availableRequestIds: number[] = [],
  completedRunnerNames: string[] = [],
  startedRunnerNames: string[] = [],
): RunnerScaleSetMessage {
  return {
    messageId,
    statistics: messageStatistics,
    jobAvailableMessages: availableRequestIds.map((runnerRequestId) => ({ runnerRequestId })),
    jobAssignedMessages: [],
    jobStartedMessages: startedRunnerNames.map((runnerName, index) => ({ runnerName, runnerId: index + 1 })),
    jobCompletedMessages: completedRunnerNames.map((runnerName) => ({ runnerName })),
  } as RunnerScaleSetMessage;
}

interface HarnessOptions {
  currentRunners?: number;
  message?: RunnerScaleSetMessage | null;
  sessionStatistics?: RunnerScaleSetStatistic | null;
}

function createHarness(options: HarnessOptions = {}) {
  const sessionStatistics = options.sessionStatistics === undefined ? statistics(0) : options.sessionStatistics;
  const getMessage = vi.fn<ScaleSetMessageSession['getMessage']>().mockResolvedValue(options.message ?? null);
  const deleteMessage = vi.fn<ScaleSetMessageSession['deleteMessage']>().mockResolvedValue(undefined);
  const acquireJobs = vi
    .fn<ScaleSetMessageSession['acquireJobs']>()
    .mockImplementation(async (requestIds) => requestIds);
  const generateJitRunnerConfig = vi
    .fn<ScaleSetApiClient['generateJitRunnerConfig']>()
    .mockImplementation(async (setting, scaleSetId) => ({
      runner: { id: scaleSetId, name: setting.name, runnerScaleSetId: scaleSetId },
      encodedJITConfig: 'encoded-jit-config',
    }));
  const removeRunner = vi.fn<ScaleSetApiClient['removeRunner']>().mockResolvedValue(undefined);
  const getRunnerByName = vi.fn<ScaleSetApiClient['getRunnerByName']>().mockResolvedValue(null);
  const getCurrentRunners = vi
    .fn<ScaleSetProvider['getCurrentRunners']>()
    .mockResolvedValue(options.currentRunners ?? 0);
  const createRunners = vi.fn<ScaleSetProvider['createRunners']>().mockImplementation(async ({ numberOfRunners }) => ({
    instances: Array.from({ length: numberOfRunners }, (_, index) => `i-${index}`),
    retryableErrorCount: 0,
    nonRetryableErrorCount: 0,
  }));
  const terminateSurplusRunners = vi.fn<ScaleSetProvider['terminateSurplusRunners']>().mockResolvedValue(0);
  const terminateCompletedRunner = vi.fn<ScaleSetProvider['terminateCompletedRunner']>().mockResolvedValue(undefined);
  const markRunnerStarted = vi.fn<ScaleSetProvider['markRunnerStarted']>().mockResolvedValue(undefined);

  const client: ScaleSetApiClient = { generateJitRunnerConfig, getRunnerByName, removeRunner };
  const session: ScaleSetMessageSession = {
    session: {
      sessionId: 'session-id',
      ownerName: runnerConfig.runnerOwner,
      messageQueueUrl: 'https://example.test/messages',
      messageQueueAccessToken: 'message-token',
      statistics: sessionStatistics,
    },
    getMessage,
    deleteMessage,
    acquireJobs,
  };
  const provider: ScaleSetProvider = {
    getCurrentRunners,
    createRunners,
    terminateSurplusRunners,
    markRunnerStarted,
    terminateCompletedRunner,
  };

  return {
    acquireJobs,
    client,
    createRunners,
    deleteMessage,
    generateJitRunnerConfig,
    getRunnerByName,
    getCurrentRunners,
    getMessage,
    markRunnerStarted,
    provider,
    removeRunner,
    session,
    terminateCompletedRunner,
    terminateSurplusRunners,
  };
}

function initializedState(latestStatistics: RunnerScaleSetStatistic): ScaleSetPollState {
  return { initialized: true, lastMessageId: 41, latestStatistics };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('scale-set capacity calculation', () => {
  it('adds the warm pool to assigned jobs and caps the result', () => {
    expect(calculateScaleSetTarget(statistics(1), 2, 5)).toBe(3);
    expect(calculateScaleSetTarget(statistics(10), 2, 5)).toBe(5);
  });

  it.each([
    [-1, 5, 0, 'minRunners must be a non-negative integer'],
    [0, -1, 0, 'maxRunners must be a non-negative integer'],
    [2, 1, 0, 'minRunners cannot be greater than maxRunners'],
    [0, 2_147_483_648, 0, 'maxRunners cannot be greater than 2147483647'],
    [0, 5, -1, 'statistics.totalAssignedJobs must be a non-negative integer'],
    [0, 5, 1.5, 'statistics.totalAssignedJobs must be a non-negative integer'],
  ])('rejects invalid capacity values', (minRunners, maxRunners, assignedJobs, expected) => {
    expect(() => calculateScaleSetTarget(statistics(assignedJobs), minRunners, maxRunners)).toThrow(expected);
  });
});

describe('pollScaleSetOnce', () => {
  it('acquires available jobs, terminates completed runners, fills the positive delta, and acks last', async () => {
    const events: string[] = [];
    const currentStatistics = statistics(4);
    const harness = createHarness({
      currentRunners: 3,
      message: message(
        42,
        currentStatistics,
        [7, 7, 9],
        ['scale-set-i-7', 'scale-set-i-9'],
        ['scale-set-i-started-1', 'scale-set-i-started-2'],
      ),
    });
    harness.markRunnerStarted.mockImplementation(async ({ runnerName }) => {
      events.push(`started:${runnerName}`);
    });
    harness.acquireJobs.mockImplementation(async () => {
      events.push('acquire');
      return [7];
    });
    harness.terminateCompletedRunner.mockImplementation(async ({ runnerName }) => {
      events.push(`terminate:${runnerName}`);
    });
    harness.getCurrentRunners.mockImplementation(async () => {
      events.push('count');
      return 3;
    });
    harness.createRunners.mockImplementation(async (input) => {
      events.push('create');
      const jitConfig = await input.generateJitConfig({ runnerName: 'scale-set-i-new' });
      expect(jitConfig).toEqual({
        encodedJitConfig: 'encoded-jit-config',
        runnerId: 123,
        runnerName: 'scale-set-i-new',
      });
      return {
        instances: ['i-new-1', 'i-new-2'],
        retryableErrorCount: 0,
        nonRetryableErrorCount: 0,
      };
    });
    harness.deleteMessage.mockImplementation(async () => {
      events.push('ack');
    });

    const result = await pollScaleSetOnce({
      client: harness.client,
      session: harness.session,
      provider: harness.provider,
      config,
      state: initializedState(statistics(0)),
    });

    expect(harness.getMessage).toHaveBeenCalledWith(41, 5, { signal: undefined });
    expect(harness.acquireJobs).toHaveBeenCalledWith([7, 9], { signal: undefined });
    expect(harness.markRunnerStarted).toHaveBeenCalledTimes(2);
    expect(harness.markRunnerStarted).toHaveBeenCalledWith({
      runnerName: 'scale-set-i-started-1',
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      scaleSetId: 123,
    });
    expect(harness.terminateCompletedRunner).toHaveBeenCalledTimes(2);
    expect(harness.terminateCompletedRunner).toHaveBeenCalledWith({
      runnerName: 'scale-set-i-7',
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      scaleSetId: 123,
    });
    expect(harness.createRunners).toHaveBeenCalledWith({
      runnerConfig: {
        runnerNamePrefix: 'scale-set-',
        runnerOwner: 'octo-org',
        runnerType: 'Org',
        scaleSetId: 123,
        ssmTokenPath: '/github-action-runners/default/runners/config',
        ssmParameterStoreTags: [{ Key: 'Environment', Value: 'unit-test' }],
      },
      numberOfRunners: 2,
      generateJitConfig: expect.any(Function),
      removeRunner: expect.any(Function),
    });
    expect(harness.getCurrentRunners).toHaveBeenCalledWith({
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      scaleSetId: 123,
      runnerNamePrefix: 'scale-set-',
      ssmTokenPath: '/github-action-runners/default/runners/config',
      removeJitRunner: expect.any(Function),
    });
    expect(harness.generateJitRunnerConfig).toHaveBeenCalledWith(
      { name: 'scale-set-i-new', workFolder: '_work' },
      123,
      { signal: undefined },
    );
    expect(events.indexOf('started:scale-set-i-started-1')).toBeLessThan(events.indexOf('count'));
    expect(events.indexOf('started:scale-set-i-started-2')).toBeLessThan(events.indexOf('count'));
    expect(events.indexOf('terminate:scale-set-i-7')).toBeLessThan(events.indexOf('count'));
    expect(events.indexOf('terminate:scale-set-i-9')).toBeLessThan(events.indexOf('count'));
    expect(events.indexOf('create')).toBeLessThan(events.indexOf('acquire'));
    expect(events.at(-1)).toBe('ack');
    expect(harness.deleteMessage).toHaveBeenCalledWith(42, { signal: undefined });
    expect(result).toEqual({
      state: { initialized: true, lastMessageId: 42, latestStatistics: currentStatistics },
      message: expect.objectContaining({ messageId: 42 }),
      acquiredRequestIds: [7],
      startedRunnerNames: ['scale-set-i-started-1', 'scale-set-i-started-2'],
      completedRunnerNames: ['scale-set-i-7', 'scale-set-i-9'],
      reconciliations: [{ currentRunners: 3, createdRunners: 2, terminatedRunners: 0, targetRunners: 5 }],
    });
  });

  it('reconciles the session snapshot before an empty first long poll', async () => {
    const harness = createHarness({ sessionStatistics: statistics(1), message: null });

    const result = await pollScaleSetOnce({
      client: harness.client,
      session: harness.session,
      provider: harness.provider,
      config,
    });

    expect(harness.createRunners).toHaveBeenCalledWith(expect.objectContaining({ numberOfRunners: 3 }));
    expect(harness.getMessage).toHaveBeenCalledAfter(harness.createRunners);
    expect(harness.deleteMessage).not.toHaveBeenCalled();
    expect(result.state).toEqual({
      initialized: true,
      lastMessageId: 0,
      latestStatistics: statistics(1),
    });
    expect(result.reconciliations).toEqual([
      { currentRunners: 0, createdRunners: 3, terminatedRunners: 0, targetRunners: 3 },
    ]);
  });

  it('rechecks capacity after an empty later long poll without acknowledging', async () => {
    const latestStatistics = statistics(0);
    const harness = createHarness({ currentRunners: 5, message: null });

    const result = await pollScaleSetOnce({
      client: harness.client,
      session: harness.session,
      provider: harness.provider,
      config,
      state: initializedState(latestStatistics),
    });

    expect(harness.getCurrentRunners).toHaveBeenCalledOnce();
    expect(harness.createRunners).not.toHaveBeenCalled();
    expect(harness.deleteMessage).not.toHaveBeenCalled();
    expect(harness.terminateSurplusRunners).toHaveBeenCalledWith({
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      scaleSetId: 123,
      runnerNamePrefix: 'scale-set-',
      desiredRunners: 2,
      excessRunners: 3,
      ssmTokenPath: '/github-action-runners/default/runners/config',
      removeRunner: expect.any(Function),
    });
    expect(result.reconciliations).toEqual([
      { currentRunners: 5, createdRunners: 0, terminatedRunners: 0, targetRunners: 2 },
    ]);
  });

  it('terminates surplus capacity before acquiring jobs or acknowledging the message', async () => {
    const events: string[] = [];
    const harness = createHarness({
      currentRunners: 5,
      message: message(42, statistics(0), [7]),
    });
    harness.getRunnerByName.mockResolvedValue({
      id: 7001,
      name: 'scale-set-i-surplus',
      runnerScaleSetId: 123,
    });
    harness.terminateSurplusRunners.mockImplementation(async ({ removeRunner }) => {
      events.push('terminate-surplus');
      await removeRunner({ runnerId: 7001, runnerName: 'scale-set-i-surplus', scaleSetId: 123 });
      return 3;
    });
    harness.acquireJobs.mockImplementation(async (requestIds) => {
      events.push('acquire');
      return requestIds;
    });
    harness.deleteMessage.mockImplementation(async () => {
      events.push('ack');
    });

    const result = await pollScaleSetOnce({
      client: harness.client,
      session: harness.session,
      provider: harness.provider,
      config,
      state: initializedState(statistics(0)),
    });

    expect(harness.terminateSurplusRunners).toHaveBeenCalledWith({
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      scaleSetId: 123,
      runnerNamePrefix: 'scale-set-',
      desiredRunners: 2,
      excessRunners: 3,
      ssmTokenPath: '/github-action-runners/default/runners/config',
      removeRunner: expect.any(Function),
    });
    expect(harness.removeRunner).toHaveBeenCalledWith(7001, { signal: undefined });
    expect(harness.createRunners).not.toHaveBeenCalled();
    expect(events).toEqual(['terminate-surplus', 'acquire', 'ack']);
    expect(result.reconciliations).toEqual([
      { currentRunners: 5, createdRunners: 0, terminatedRunners: 3, targetRunners: 2 },
    ]);
  });

  it('does not acquire or acknowledge when surplus termination fails', async () => {
    const harness = createHarness({
      currentRunners: 5,
      message: message(42, statistics(0), [7]),
    });
    harness.terminateSurplusRunners.mockRejectedValue(new Error('surplus termination failed'));

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state: initializedState(statistics(0)),
      }),
    ).rejects.toThrow('surplus termination failed');
    expect(harness.acquireJobs).not.toHaveBeenCalled();
    expect(harness.deleteMessage).not.toHaveBeenCalled();
  });

  it.each([-1, 4])('rejects an invalid terminated surplus count of %s', async (terminatedRunners) => {
    const harness = createHarness({
      currentRunners: 5,
      message: message(42, statistics(0)),
    });
    harness.terminateSurplusRunners.mockResolvedValue(terminatedRunners);

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state: initializedState(statistics(0)),
      }),
    ).rejects.toThrow();
    expect(harness.deleteMessage).not.toHaveBeenCalled();
  });

  it('does not acknowledge a message when provider creation is incomplete', async () => {
    const currentStatistics = statistics(2);
    const state = initializedState(statistics(0));
    const harness = createHarness({ message: message(42, currentStatistics) });
    harness.createRunners.mockResolvedValue({
      instances: ['i-only-one'],
      retryableErrorCount: 1,
      nonRetryableErrorCount: 0,
    });

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state,
      }),
    ).rejects.toEqual(expect.any(ScaleSetReconciliationError));
    expect(harness.deleteMessage).not.toHaveBeenCalled();
    expect(state).toEqual(initializedState(statistics(0)));
  });

  it('does not acknowledge or create capacity when completion termination fails', async () => {
    const harness = createHarness({ message: message(42, statistics(0), [], ['scale-set-i-7']) });
    harness.terminateCompletedRunner.mockRejectedValue(new Error('termination failed'));

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state: initializedState(statistics(0)),
      }),
    ).rejects.toThrow('termination failed');
    expect(harness.getCurrentRunners).not.toHaveBeenCalled();
    expect(harness.createRunners).not.toHaveBeenCalled();
    expect(harness.deleteMessage).not.toHaveBeenCalled();
  });

  it('does not reconcile or acknowledge when started-runner marking fails', async () => {
    const harness = createHarness({
      message: message(42, statistics(0), [], [], ['scale-set-i-started']),
    });
    harness.markRunnerStarted.mockRejectedValue(new Error('ready tag failed'));

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state: initializedState(statistics(0)),
      }),
    ).rejects.toThrow('ready tag failed');
    expect(harness.getCurrentRunners).not.toHaveBeenCalled();
    expect(harness.createRunners).not.toHaveBeenCalled();
    expect(harness.deleteMessage).not.toHaveBeenCalled();
  });

  it('passes GitHub runner cleanup through both provider reconciliation callbacks', async () => {
    const harness = createHarness({ message: message(42, statistics(0)) });
    harness.getRunnerByName.mockImplementation(async (runnerName) => ({
      id: runnerName === 'scale-set-i-current' ? 7001 : 7002,
      name: runnerName,
      runnerScaleSetId: 123,
    }));
    harness.getCurrentRunners.mockImplementation(async ({ removeJitRunner }) => {
      await removeJitRunner({ runnerId: 7001, runnerName: 'scale-set-i-current', scaleSetId: 123 });
      return 0;
    });
    harness.createRunners.mockImplementation(async ({ numberOfRunners, removeRunner }) => {
      await removeRunner({ runnerId: 7002, runnerName: 'scale-set-i-created', scaleSetId: 123 });
      return {
        instances: Array.from({ length: numberOfRunners }, (_, index) => `i-${index}`),
        retryableErrorCount: 0,
        nonRetryableErrorCount: 0,
      };
    });

    await pollScaleSetOnce({
      client: harness.client,
      session: harness.session,
      provider: harness.provider,
      config,
      state: initializedState(statistics(0)),
    });

    expect(harness.removeRunner).toHaveBeenCalledWith(7001, { signal: undefined });
    expect(harness.removeRunner).toHaveBeenCalledWith(7002, { signal: undefined });
  });

  it.each([
    ['runner ID', { id: 7002, name: 'scale-set-i-current', runnerScaleSetId: 123 }],
    ['runner name', { id: 7001, name: 'different-runner', runnerScaleSetId: 123 }],
    ['scale-set ID', { id: 7001, name: 'scale-set-i-current', runnerScaleSetId: 999 }],
  ])('fails closed when tagged cleanup does not match the exact GitHub %s', async (_mismatch, actualRunner) => {
    const harness = createHarness({ message: message(42, statistics(0)) });
    harness.getRunnerByName.mockResolvedValue(actualRunner);
    harness.getCurrentRunners.mockImplementation(async ({ removeJitRunner }) => {
      await removeJitRunner({ runnerId: 7001, runnerName: 'scale-set-i-current', scaleSetId: 123 });
      return 2;
    });

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state: initializedState(statistics(0)),
      }),
    ).rejects.toThrow('refusing to remove runner 7001');

    expect(harness.getRunnerByName).toHaveBeenCalledWith('scale-set-i-current', { signal: undefined });
    expect(harness.removeRunner).not.toHaveBeenCalled();
    expect(harness.deleteMessage).not.toHaveBeenCalled();
  });

  it('treats an absent exact-name lookup as already removed', async () => {
    const harness = createHarness({ message: message(42, statistics(0)) });
    harness.getCurrentRunners.mockImplementation(async ({ removeJitRunner }) => {
      await removeJitRunner({ runnerId: 7001, runnerName: 'scale-set-i-current', scaleSetId: 123 });
      return 2;
    });

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state: initializedState(statistics(0)),
      }),
    ).resolves.toEqual(expect.objectContaining({ acquiredRequestIds: [] }));

    expect(harness.getRunnerByName).toHaveBeenCalledWith('scale-set-i-current', { signal: undefined });
    expect(harness.removeRunner).not.toHaveBeenCalled();
    expect(harness.deleteMessage).toHaveBeenCalledWith(42, { signal: undefined });
  });

  it('treats a 404 during exact GitHub runner deletion as successful cleanup', async () => {
    const harness = createHarness({ message: message(42, statistics(0)) });
    harness.getRunnerByName.mockResolvedValue({
      id: 7001,
      name: 'scale-set-i-current',
      runnerScaleSetId: 123,
    });
    harness.removeRunner.mockRejectedValue(
      new ScaleSetHttpError({
        method: 'DELETE',
        url: 'https://example.test/_apis/distributedtask/pools/0/agents/7001',
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
        responseBody: '',
      }),
    );
    harness.getCurrentRunners.mockImplementation(async ({ removeJitRunner }) => {
      await removeJitRunner({ runnerId: 7001, runnerName: 'scale-set-i-current', scaleSetId: 123 });
      return 2;
    });

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state: initializedState(statistics(0)),
      }),
    ).resolves.toEqual(expect.objectContaining({ acquiredRequestIds: [] }));
    expect(harness.deleteMessage).toHaveBeenCalledWith(42, { signal: undefined });
  });

  it('best-effort removes the exact scale-set runner by name when JIT generation throws', async () => {
    const harness = createHarness({ message: message(42, statistics(0)) });
    harness.generateJitRunnerConfig.mockRejectedValue(new Error('generation response lost'));
    harness.getRunnerByName.mockResolvedValue({
      id: 7001,
      name: 'scale-set-i-new',
      runnerScaleSetId: 123,
    });
    harness.createRunners.mockImplementation(async (input) => {
      await input.generateJitConfig({ runnerName: 'scale-set-i-new' });
      return { instances: [], retryableErrorCount: 1, nonRetryableErrorCount: 0 };
    });

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state: initializedState(statistics(0)),
      }),
    ).rejects.toThrow('generation response lost');
    expect(harness.getRunnerByName).toHaveBeenCalledWith('scale-set-i-new', { signal: undefined });
    expect(harness.removeRunner).toHaveBeenCalledWith(7001, { signal: undefined });
    expect(harness.deleteMessage).not.toHaveBeenCalled();
  });

  it('rejects a null JIT runner and leaves the message unacknowledged', async () => {
    const harness = createHarness({ message: message(42, statistics(0)) });
    harness.generateJitRunnerConfig.mockResolvedValue({
      runner: null,
      encodedJITConfig: 'encoded-jit-config',
    });
    harness.getRunnerByName.mockResolvedValue({
      id: 7001,
      name: 'scale-set-i-new',
      runnerScaleSetId: 123,
    });
    harness.createRunners.mockImplementation(async (input) => {
      await input.generateJitConfig({ runnerName: 'scale-set-i-new' });
      return { instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 0 };
    });

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config: { ...config, workFolder: undefined },
        state: initializedState(statistics(0)),
      }),
    ).rejects.toThrow("GitHub did not return a runner for JIT configuration 'scale-set-i-new'");
    expect(harness.generateJitRunnerConfig).toHaveBeenCalledWith(
      { name: 'scale-set-i-new', workFolder: '_work' },
      123,
      { signal: undefined },
    );
    expect(harness.getRunnerByName).toHaveBeenCalledWith('scale-set-i-new', { signal: undefined });
    expect(harness.removeRunner).toHaveBeenCalledWith(7001, { signal: undefined });
    expect(harness.deleteMessage).not.toHaveBeenCalled();
  });

  it('requires statistics from either the message or the retained session state', async () => {
    const harness = createHarness({ sessionStatistics: null, message: message(42, null) });

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
      }),
    ).rejects.toThrow('Scale-set message 42 does not contain statistics');
    expect(harness.deleteMessage).not.toHaveBeenCalled();
  });

  it('rejects invalid scale-set configuration and provider counts', async () => {
    const harness = createHarness({ currentRunners: -1, message: message(42, statistics(0)) });

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config: { ...config, scaleSetId: 0 },
      }),
    ).rejects.toThrow('scaleSetId must be a positive integer');
    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state: initializedState(statistics(0)),
      }),
    ).rejects.toThrow('provider current runner count must be a non-negative integer');
    expect(harness.deleteMessage).not.toHaveBeenCalled();
  });

  it('fails an empty poll when neither the session nor retained state has statistics', async () => {
    const harness = createHarness({ sessionStatistics: null, message: null });

    await expect(
      pollScaleSetOnce({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
      }),
    ).rejects.toThrow('Scale-set session returned no message and no statistics snapshot');
  });
});

describe('runScaleSetPollLoop', () => {
  it('carries poll state until the caller aborts the loop', async () => {
    const controller = new AbortController();
    const harness = createHarness({
      sessionStatistics: statistics(0),
      currentRunners: 2,
      message: message(42, statistics(0)),
    });

    const state = await runScaleSetPollLoop({
      client: harness.client,
      session: harness.session,
      provider: harness.provider,
      config,
      signal: controller.signal,
      onPoll: () => controller.abort(),
    });

    expect(state.lastMessageId).toBe(42);
    expect(harness.getMessage).toHaveBeenCalledOnce();
  });

  it('returns the retained state when an aborted long poll throws AbortError', async () => {
    const controller = new AbortController();
    const harness = createHarness();
    const state = initializedState(statistics(0));
    harness.getMessage.mockImplementation(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });

    await expect(
      runScaleSetPollLoop({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state,
        signal: controller.signal,
      }),
    ).resolves.toBe(state);
  });

  it('propagates non-abort failures', async () => {
    const harness = createHarness();
    harness.getMessage.mockRejectedValue(new Error('poll failed'));

    await expect(
      runScaleSetPollLoop({
        client: harness.client,
        session: harness.session,
        provider: harness.provider,
        config,
        state: initializedState(statistics(0)),
      }),
    ).rejects.toThrow('poll failed');
  });
});

describe('createScaleSetPollState', () => {
  it('normalizes a null session statistic snapshot', () => {
    const harness = createHarness({ sessionStatistics: null });

    expect(createScaleSetPollState(harness.session)).toEqual({
      initialized: false,
      lastMessageId: 0,
      latestStatistics: undefined,
    });
  });
});

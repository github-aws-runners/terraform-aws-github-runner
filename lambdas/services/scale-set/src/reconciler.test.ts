import type { MessageSessionClient, RunnerScaleSetMessage } from '@aws-github-runner/github-actions-scale-set';
import type { ScaleSetComputeProvider, ScaleSetReconcileResult } from '@aws-github-runner/compute-providers/scale-set';
import { describe, expect, it, vi } from 'vitest';

import type { ScaleSetReconcilerConfig, ScaleSetServiceConfig } from './config';
import type { ScaleSetReconcilerStatusReporter } from './health';
import {
  ScaleSetReconciler,
  calculateDesiredRunners,
  validateProviderResult,
  type ScaleSetReconcilerClient,
  type ScaleSetReconcilerDependencies,
} from './reconciler';

const config: ScaleSetReconcilerConfig = {
  schemaVersion: 1,
  runnerConfigName: 'linux',
  scaleSetId: 42,
  scaleSetName: 'linux',
  githubConfigUrl: 'https://github.com/example',
  githubApp: {
    appIdParameterName: '/app/id',
    privateKeyParameterName: '/app/key',
    installationIdParameterName: '/app/installation',
  },
  computeProvider: { type: 'ec2', configuration: {} },
  minRunners: 0,
  maxRunners: 10,
  bootTimeoutMinutes: 10,
  sessionOwner: 'group.linux',
  workFolder: '_work',
  forceGhes: false,
};

const serviceConfig: Pick<
  ScaleSetServiceConfig,
  'sessionCloseTimeoutMs' | 'reconnectInitialBackoffMs' | 'reconnectMaxBackoffMs'
> = { sessionCloseTimeoutMs: 100, reconnectInitialBackoffMs: 1, reconnectMaxBackoffMs: 10 };

function result(overrides: Partial<ScaleSetReconcileResult> = {}): ScaleSetReconcileResult {
  return {
    status: 'converged',
    desiredRunners: 1,
    currentRunners: 1,
    actions: { launched: 0, terminated: 0, retainedBusy: 0, retainedUnknown: 0 },
    errors: [],
    ...overrides,
  };
}

function reporter(): ScaleSetReconcilerStatusReporter {
  return {
    markSessionReady: vi.fn(),
    markProgress: vi.fn(),
    markReconnecting: vi.fn(),
    markFailed: vi.fn(),
    markStopping: vi.fn(),
  };
}

function message(): RunnerScaleSetMessage {
  return {
    messageId: 7,
    statistics: {
      totalAvailableJobs: 1,
      totalAcquiredJobs: 0,
      totalAssignedJobs: 1,
      totalRunningJobs: 0,
      totalRegisteredRunners: 1,
      totalBusyRunners: 0,
      totalIdleRunners: 1,
    },
    jobAvailableMessages: [{ runnerRequestId: 99 } as RunnerScaleSetMessage['jobAvailableMessages'][number]],
    jobAssignedMessages: [],
    jobStartedMessages: [
      { runnerId: 5, runnerName: 'runner-5' } as RunnerScaleSetMessage['jobStartedMessages'][number],
    ],
    jobCompletedMessages: [],
  };
}

function fixture(options: {
  session: Partial<MessageSessionClient> & { session: MessageSessionClient['session'] };
  reconcile?: ScaleSetComputeProvider['reconcile'];
}) {
  const computeProvider: ScaleSetComputeProvider = {
    reconcile: options.reconcile ?? vi.fn().mockResolvedValue(result()),
  };
  const client: ScaleSetReconcilerClient = {
    getRunnerScaleSetById: vi.fn().mockResolvedValue({ id: 42, name: 'linux', runnerGroupId: 7 }),
    getRunnerScaleSet: vi.fn().mockResolvedValue({ id: 42, name: 'linux', runnerGroupId: 7 }),
    createRunnerScaleSet: vi.fn().mockResolvedValue({ id: 42, name: 'linux', runnerGroupId: 7 }),
    getRunnerGroupByName: vi.fn().mockResolvedValue({
      id: 7,
      name: 'runner-group',
      size: 0,
      isDefaultGroup: false,
    }),
    createMessageSessionClient: vi.fn().mockResolvedValue(options.session as MessageSessionClient),
    generateJitRunnerConfig: vi.fn(),
    getRunnerByName: vi.fn(),
    removeRunner: vi.fn(),
    systemInfo: { scaleSetId: 42 },
    setSystemInfo: vi.fn(),
  };
  const dependencies: ScaleSetReconcilerDependencies = {
    createAccessTokenProvider: vi.fn().mockResolvedValue(async () => ({ token: 'not-a-real-token' })),
    createClient: vi.fn().mockReturnValue(client),
    computeProviders: { create: vi.fn().mockReturnValue(computeProvider) },
    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    sleep: vi.fn(async (_delay, signal) => {
      if (!signal.aborted)
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    }),
    random: () => 0,
    closeSignal: () => new AbortController().signal,
    parameterStore: { get: vi.fn().mockResolvedValue(new Map()), put: vi.fn() },
  };
  return { client, computeProvider, dependencies };
}

describe('ScaleSetReconciler', () => {
  it('resolves the GitHub runner-group and scale-set IDs from their names', async () => {
    const abort = new AbortController();
    const session = {
      session: { statistics: undefined },
      getMessage: vi.fn().mockResolvedValue(message()),
      deleteMessage: vi.fn(),
      acquireJobs: vi.fn(),
      close: vi.fn(),
    };
    const { client, dependencies } = fixture({
      session,
      reconcile: vi.fn(async () => {
        abort.abort();
        return result();
      }),
    });
    vi.mocked(client.getRunnerScaleSet).mockResolvedValue({ id: 42, name: 'linux', runnerGroupId: 7 });

    await new ScaleSetReconciler(
      {
        ...config,
        scaleSetId: undefined,
        runnerGroupName: 'runner-group',
        runnerGroupIdParameterName: '/runner/group-id',
        scaleSetName: 'linux',
      },
      serviceConfig,
      dependencies,
    ).run(abort.signal, reporter());

    expect(client.getRunnerGroupByName).toHaveBeenCalledWith('runner-group', { signal: abort.signal });
    expect(client.getRunnerScaleSet).toHaveBeenCalledWith(7, 'linux', { signal: abort.signal });
    expect(client.setSystemInfo).toHaveBeenCalledWith(expect.objectContaining({ scaleSetId: 42 }));
    expect(dependencies.parameterStore.put).toHaveBeenCalledWith('/runner/group-id', '7');
    expect(dependencies.logger.info).toHaveBeenCalledWith(
      'scale_set_compute_provider_created',
      expect.objectContaining({ computeProviderType: 'ec2' }),
    );
    expect(dependencies.logger.info).toHaveBeenCalledWith(
      'scale_set_compute_provider_reconcile_started',
      expect.objectContaining({ computeProviderType: 'ec2', desiredRunners: 1, busyRunners: 0 }),
    );
  });

  it('registers a missing scale set in the resolved runner group', async () => {
    const abort = new AbortController();
    const session = {
      session: { statistics: undefined },
      getMessage: vi.fn().mockResolvedValue(message()),
      deleteMessage: vi.fn(),
      acquireJobs: vi.fn(),
      close: vi.fn(),
    };
    const { client, dependencies } = fixture({
      session,
      reconcile: vi.fn(async () => {
        abort.abort();
        return result();
      }),
    });
    vi.mocked(client.getRunnerScaleSet).mockResolvedValueOnce(null);

    await new ScaleSetReconciler(
      { ...config, scaleSetId: undefined, runnerGroupName: 'runner-group', scaleSetName: 'linux' },
      serviceConfig,
      dependencies,
    ).run(abort.signal, reporter());

    expect(client.createRunnerScaleSet).toHaveBeenCalledWith(
      {
        name: 'linux',
        runnerGroupId: 7,
        labels: [{ name: 'linux' }],
        runnerSetting: {},
      },
      { signal: abort.signal },
    );
  });

  it('acknowledges before acquisition, lifecycle observation, and reconciliation', async () => {
    const order: string[] = [];
    const abort = new AbortController();
    const session = {
      session: { statistics: undefined },
      getMessage: vi.fn().mockResolvedValue(message()),
      acquireJobs: vi.fn(async () => {
        order.push('acquire');
        return [99];
      }),
      deleteMessage: vi.fn(async () => {
        order.push('delete');
      }),
      close: vi.fn(),
    };
    const reconcile = vi.fn(async (request) => {
      order.push('reconcile');
      expect(request.busyRunners).toBe(0);
      expect(request.bootTimeoutMinutes).toBe(10);
      expect(request.runnerStates).toContainEqual(
        expect.objectContaining({ runnerId: 5, runnerName: 'runner-5', lifecycle: 'started' }),
      );
      abort.abort();
      return result();
    });
    const { dependencies } = fixture({ session, reconcile });
    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(abort.signal, reporter());
    expect(order).toEqual(['delete', 'acquire', 'reconcile']);
    expect(session.deleteMessage).toHaveBeenCalledWith(7, { signal: abort.signal });
    expect(dependencies.computeProviders.create).toHaveBeenCalledWith('ec2', {
      runnerConfigName: 'linux',
      scaleSetId: 42,
      githubScope: 'https://github.com/example',
      configuration: {},
    });
  });

  it('acknowledges and stops when reconciliation rejects', async () => {
    const abort = new AbortController();
    const session = {
      session: { statistics: undefined },
      getMessage: vi.fn().mockResolvedValue(message()),
      acquireJobs: vi.fn().mockResolvedValue([99]),
      deleteMessage: vi.fn(),
      close: vi.fn(),
    };
    const { dependencies } = fixture({ session, reconcile: vi.fn().mockRejectedValue(new Error('provider failed')) });
    const status = reporter();

    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(abort.signal, status);

    expect(session.deleteMessage).toHaveBeenCalledOnce();
    expect(status.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ScaleSetProviderReconciliationError' }),
    );
    expect(status.markReconnecting).not.toHaveBeenCalled();
    expect(dependencies.sleep).not.toHaveBeenCalled();
  });

  it('does not process a message when acknowledgement fails', async () => {
    const abort = new AbortController();
    const reconcile = vi.fn();
    const session = {
      session: { statistics: undefined },
      getMessage: vi.fn().mockResolvedValue(message()),
      acquireJobs: vi.fn(),
      deleteMessage: vi.fn().mockRejectedValue(new Error('acknowledgement failed')),
      close: vi.fn(),
    };
    const { dependencies } = fixture({ session, reconcile });
    dependencies.sleep = vi.fn(async () => abort.abort());
    const status = reporter();

    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(abort.signal, status);

    expect(session.deleteMessage).toHaveBeenCalledOnce();
    expect(session.acquireJobs).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(status.markReconnecting).toHaveBeenCalledOnce();
  });

  it('acknowledges and stops when the provider returns an error result', async () => {
    const abort = new AbortController();
    const order: string[] = [];
    const session = {
      session: { statistics: undefined },
      getMessage: vi.fn().mockResolvedValue(message()),
      acquireJobs: vi.fn().mockResolvedValue([99]),
      deleteMessage: vi.fn(async () => {
        order.push('delete');
      }),
      close: vi.fn(),
    };
    const reconcile = vi.fn(async () => {
      order.push('reconcile');
      return result({
        status: 'error',
        currentRunners: 0,
        errors: [{ operation: 'launch', code: 'ThrottlingException' }],
      });
    });
    const { dependencies } = fixture({ session, reconcile });
    const status = reporter();

    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(abort.signal, status);

    expect(order).toEqual(['delete', 'reconcile']);
    expect(status.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ScaleSetProviderReconciliationError' }),
    );
    expect(status.markReconnecting).not.toHaveBeenCalled();
    expect(dependencies.sleep).not.toHaveBeenCalled();
  });

  it('does not call public GitHub runner inventory after a provider error result', async () => {
    const session = {
      session: { statistics: undefined },
      getMessage: vi.fn().mockResolvedValue(message()),
      acquireJobs: vi.fn().mockResolvedValue([99]),
      deleteMessage: vi.fn(),
      close: vi.fn(),
    };
    const reconcile = vi.fn().mockResolvedValue(
      result({
        status: 'error',
        currentRunners: 0,
        errors: [{ operation: 'launch', code: 'EC2_LAUNCH_FAILED' }],
      }),
    );
    const { dependencies } = fixture({ session, reconcile });
    const status = reporter();

    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(new AbortController().signal, status);

    expect(reconcile).toHaveBeenCalledOnce();
    expect(status.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ScaleSetProviderReconciliationError' }),
    );
  });

  it('uses the Actions-service identity check without public runner verification', async () => {
    const abort = new AbortController();
    const order: string[] = [];
    const session = {
      session: { statistics: undefined },
      getMessage: vi.fn().mockResolvedValue(message()),
      acquireJobs: vi.fn(async () => {
        order.push('acquire');
        return [99];
      }),
      deleteMessage: vi.fn(async () => {
        order.push('delete');
      }),
      close: vi.fn(),
    };
    const reconcile = vi.fn(async (request) => {
      order.push('reconcile');
      await expect(request.removeRunner({ runnerId: 5, runnerName: 'runner-5', scaleSetId: 42 })).resolves.toEqual({
        status: 'removed',
      });
      abort.abort();
      return result({
        status: 'retained',
        currentRunners: 2,
        actions: { launched: 0, terminated: 0, retainedBusy: 1, retainedUnknown: 0 },
      });
    });
    const { client, dependencies } = fixture({ session, reconcile });
    vi.mocked(client.getRunnerByName).mockImplementation(async () => {
      order.push('actions-refetch');
      return { id: 5, name: 'runner-5', runnerScaleSetId: 42 };
    });
    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(abort.signal, reporter());

    expect(order).toEqual(['delete', 'acquire', 'reconcile', 'actions-refetch']);
    expect(client.removeRunner).toHaveBeenCalledWith(5, { signal: abort.signal });
    expect(session.deleteMessage).toHaveBeenCalledOnce();
    expect(session.acquireJobs).toHaveBeenCalledTimes(1);
  });

  it('bounds the lifecycle cache per reconciler', () => {
    const { dependencies } = fixture({ session: { session: {}, close: vi.fn() } });
    const reconciler = new ScaleSetReconciler(config, serviceConfig, dependencies) as unknown as {
      rememberLifecycle(id: number, name: string, lifecycle: 'started'): void;
      lifecycle: Map<string, unknown>;
      resolvedScaleSetId: number;
    };
    reconciler.resolvedScaleSetId = 42;
    for (let index = 0; index < 1100; index += 1) reconciler.rememberLifecycle(index + 1, `runner-${index}`, 'started');
    expect(reconciler.lifecycle.size).toBe(1000);
    expect(reconciler.lifecycle.has('runner-0')).toBe(false);
  });
});

describe('reconciler helpers', () => {
  it('calculates bounded desired capacity', () => {
    expect(calculateDesiredRunners(5, 2, 6)).toBe(6);
    expect(calculateDesiredRunners(8, 2, 5)).toBe(8);
    expect(() => calculateDesiredRunners(-1, 0, 1)).toThrow('non-negative integer');
  });

  it.each([
    { status: 'unexpected' },
    { status: 'retryable_error' },
    { status: 'non_retryable_error' },
    { retryable: true },
    { actions: { launched: 0, terminated: 0, retainedBusy: -1, retainedUnknown: 0 } },
    { actions: { launched: 0, terminated: 0, retainedBusy: 0, retainedUnknown: 0, retryable: true } },
    { status: 'converged', errors: [{ operation: 'list', code: 'UNEXPECTED_ERROR' }] },
    { status: 'retained', errors: [{ operation: 'list', code: 'UNEXPECTED_ERROR' }] },
    { status: 'error', errors: [] },
    { currentRunners: 0 },
    { currentRunners: 2 },
    { status: 'retained' },
    { errors: [{ operation: 'shell', code: 'BAD' }] },
    { errors: [{ operation: 'list', code: 'contains spaces' }] },
    { errors: [{ operation: 'list', code: 'BAD!CODE' }] },
    { errors: [{ operation: 'list', code: 'BAD\nCODE' }] },
    { errors: [{ operation: 'list', code: 'BAD', retryable: true }] },
  ])('rejects malformed compute-provider result metadata: %o', (overrides) => {
    expect(() => validateProviderResult({ ...result(), ...overrides } as ScaleSetReconcileResult, 1)).toThrow(
      /scale-set compute provider returned (?:an? )?invalid/,
    );
  });

  it('accepts bounded provider and AWS error codes', () => {
    expect(() =>
      validateProviderResult(
        result({
          status: 'error',
          errors: [
            { operation: 'list', code: 'AccessDeniedException' },
            { operation: 'launch', code: 'ThrottlingException' },
          ],
        }),
        1,
      ),
    ).not.toThrow();
  });
});

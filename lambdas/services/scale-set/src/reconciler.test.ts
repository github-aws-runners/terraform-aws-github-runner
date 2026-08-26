import type { MessageSessionClient, RunnerScaleSetMessage } from '@aws-github-runner/github-actions-scale-set';
import type { ScaleSetComputeProvider, ScaleSetReconcileResult } from '@aws-github-runner/compute-providers/scale-set';

import type { ScaleSetReconcilerConfig, ScaleSetServiceConfig } from './config';
import type { ScaleSetReconcilerStatusReporter } from './health';
import {
  ScaleSetReconciler,
  TtlScaleSetRunnerInventoryCache,
  calculateDesiredRunners,
  validateProviderResult,
  type ScaleSetReconcilerClient,
  type ScaleSetReconcilerDependencies,
} from './reconciler';

const config: ScaleSetReconcilerConfig = {
  schemaVersion: 1,
  runnerConfigName: 'linux',
  scaleSetId: 42,
  expectedScaleSetName: 'linux',
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
    needsRunnerInventory: false,
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
    getRunnerScaleSetById: vi.fn().mockResolvedValue({ id: 42, name: 'linux' }),
    createMessageSessionClient: vi.fn().mockResolvedValue(options.session as MessageSessionClient),
    generateJitRunnerConfig: vi.fn(),
    getGitHubRunner: vi.fn().mockResolvedValue({ id: 5, name: 'runner-5', status: 'online', busy: false }),
    getRunnerByName: vi.fn(),
    listGitHubRunners: vi.fn().mockResolvedValue([]),
    listRunners: vi.fn().mockResolvedValue([]),
    removeRunner: vi.fn(),
  };
  const dependencies: ScaleSetReconcilerDependencies = {
    createAccessTokenProvider: vi.fn().mockResolvedValue(async () => ({ token: 'not-a-real-token' })),
    createClient: vi.fn().mockReturnValue(client),
    computeProviders: { create: vi.fn().mockReturnValue(computeProvider) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    sleep: vi.fn(async (_delay, signal) => {
      if (!signal.aborted)
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    }),
    random: () => 0,
    closeSignal: () => new AbortController().signal,
    runnerInventory: new TtlScaleSetRunnerInventoryCache(),
  };
  return { client, computeProvider, dependencies };
}

describe('ScaleSetReconciler', () => {
  it('acknowledges only after acquisition, lifecycle observation, and successful reconciliation', async () => {
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
        abort.abort();
      }),
      close: vi.fn(),
    };
    const reconcile = vi.fn(async (request) => {
      order.push('reconcile');
      expect(request.runnerInventoryComplete).toBe(false);
      expect(request.bootTimeoutMinutes).toBe(10);
      expect(request.runnerStates).toContainEqual(
        expect.objectContaining({ runnerId: 5, runnerName: 'runner-5', lifecycle: 'started' }),
      );
      return result();
    });
    const { dependencies } = fixture({ session, reconcile });
    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(abort.signal, reporter());
    expect(order).toEqual(['acquire', 'reconcile', 'delete']);
    expect(dependencies.computeProviders.create).toHaveBeenCalledWith('ec2', {
      runnerConfigName: 'linux',
      scaleSetId: 42,
      githubScope: 'https://github.com/example',
      configuration: {},
    });
  });

  it('does not query public or Actions runner inventory on steady-state empty polls', async () => {
    const abort = new AbortController();
    let calls = 0;
    const reconcile = vi.fn(async () => {
      calls += 1;
      if (calls === 2) abort.abort();
      return result({ desiredRunners: 0, currentRunners: 0 });
    });
    const session = {
      session: { statistics: { ...message().statistics, totalAssignedJobs: 0 } },
      getMessage: vi.fn().mockResolvedValue(null),
      close: vi.fn(),
    };
    const { client, dependencies } = fixture({ session, reconcile });
    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(abort.signal, reporter());
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(client.listGitHubRunners).not.toHaveBeenCalled();
    expect(client.listRunners).not.toHaveBeenCalled();
  });

  it('performs the typed inventory second pass whenever requested, including at desired physical capacity', async () => {
    const abort = new AbortController();
    const reconcile = vi
      .fn()
      .mockResolvedValueOnce(
        result({
          status: 'retained',
          desiredRunners: 1,
          currentRunners: 1,
          needsRunnerInventory: true,
          actions: { launched: 0, terminated: 0, retainedBusy: 0, retainedUnknown: 1 },
          errors: [],
        }),
      )
      .mockImplementationOnce(async (request) => {
        expect(request.runnerInventoryComplete).toBe(true);
        expect(request.runnerStates).toContainEqual({
          runnerId: 5,
          runnerName: 'runner-5',
          scaleSetId: 42,
          status: 'online',
          busy: false,
          lifecycle: 'unknown',
        });
        abort.abort();
        return result({ desiredRunners: 1, currentRunners: 1 });
      });
    const session = {
      session: { statistics: message().statistics },
      close: vi.fn(),
    };
    const { client, dependencies } = fixture({ session, reconcile });
    vi.mocked(client.listRunners).mockResolvedValue([{ id: 5, name: 'runner-5', runnerScaleSetId: 42 }]);
    vi.mocked(client.listGitHubRunners).mockResolvedValue([{ id: 5, name: 'runner-5', status: 'online', busy: false }]);
    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(abort.signal, reporter());
    expect(reconcile.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ runnerInventoryComplete: false }));
    expect(client.listGitHubRunners).toHaveBeenCalledTimes(1);
    expect(client.listRunners).toHaveBeenCalledTimes(1);
  });

  it('rejects a provider that requests another inventory after the complete second pass', async () => {
    const abort = new AbortController();
    const reconcile = vi.fn().mockResolvedValue(
      result({
        status: 'retained',
        currentRunners: 1,
        needsRunnerInventory: true,
        actions: { launched: 0, terminated: 0, retainedBusy: 0, retainedUnknown: 1 },
      }),
    );
    const session = { session: { statistics: message().statistics }, close: vi.fn() };
    const { dependencies } = fixture({ session, reconcile });
    dependencies.sleep = vi.fn(async () => abort.abort());
    const status = reporter();

    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(abort.signal, status);

    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(status.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'scale-set compute provider requested inventory after a complete inventory pass',
      }),
    );
  });

  it('leaves a message unacknowledged when reconciliation fails', async () => {
    const abort = new AbortController();
    const session = {
      session: { statistics: undefined },
      getMessage: vi.fn().mockResolvedValue(message()),
      acquireJobs: vi.fn().mockResolvedValue([99]),
      deleteMessage: vi.fn(),
      close: vi.fn(),
    };
    const { dependencies } = fixture({ session, reconcile: vi.fn().mockRejectedValue(new Error('temporary')) });
    dependencies.sleep = vi.fn(async () => abort.abort());
    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(abort.signal, reporter());
    expect(session.deleteMessage).not.toHaveBeenCalled();
  });

  it('re-fetches exact state in the serialized loop and acknowledges a typed busy retention', async () => {
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
        abort.abort();
      }),
      close: vi.fn(),
    };
    const reconcile = vi.fn(async (request) => {
      order.push('reconcile');
      await expect(request.removeRunner({ runnerId: 5, runnerName: 'runner-5', scaleSetId: 42 })).resolves.toEqual({
        status: 'retained_busy',
      });
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
    vi.mocked(client.getGitHubRunner).mockImplementation(async () => {
      order.push('github-refetch');
      return { id: 5, name: 'runner-5', status: 'online', busy: true };
    });
    await new ScaleSetReconciler(config, serviceConfig, dependencies).run(abort.signal, reporter());

    expect(order).toEqual(['acquire', 'reconcile', 'actions-refetch', 'github-refetch', 'delete']);
    expect(client.removeRunner).not.toHaveBeenCalled();
    expect(session.deleteMessage).toHaveBeenCalledOnce();
    expect(session.acquireJobs).toHaveBeenCalledTimes(1);
  });

  it('bounds the lifecycle cache per reconciler', () => {
    const { dependencies } = fixture({ session: { session: {}, close: vi.fn() } });
    const reconciler = new ScaleSetReconciler(config, serviceConfig, dependencies) as unknown as {
      rememberLifecycle(id: number, name: string, lifecycle: 'started'): void;
      lifecycle: Map<string, unknown>;
    };
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

  it('shares successful inventory loads and retries failed loads', async () => {
    let now = 0;
    const cache = new TtlScaleSetRunnerInventoryCache(100, () => now);
    const loader = vi.fn().mockResolvedValue([{ id: 1, name: 'a', status: 'online', busy: false }]);
    await Promise.all([cache.get('scope', loader), cache.get('scope', loader)]);
    expect(loader).toHaveBeenCalledTimes(1);
    now = 101;
    await cache.get('scope', loader);
    expect(loader).toHaveBeenCalledTimes(2);
    await expect(cache.get('failed', vi.fn().mockRejectedValue(new Error('nope')))).rejects.toThrow('nope');
  });

  it.each([
    { status: 'unexpected' },
    { needsRunnerInventory: 'yes' },
    { actions: { launched: 0, terminated: 0, retainedBusy: -1, retainedUnknown: 0 } },
    { errors: [{ operation: 'shell', code: 'BAD', retryable: false }] },
    { errors: [{ operation: 'list', code: 'contains spaces', retryable: false }] },
    { errors: [{ operation: 'list', code: 'BAD!CODE', retryable: false }] },
    { errors: [{ operation: 'list', code: 'BAD\nCODE', retryable: false }] },
  ])('rejects malformed compute-provider result metadata: %o', (overrides) => {
    expect(() => validateProviderResult({ ...result(), ...overrides } as ScaleSetReconcileResult, 1)).toThrow(
      /scale-set compute provider returned (?:an? )?invalid/,
    );
  });

  it('accepts bounded provider and AWS error codes', () => {
    expect(() =>
      validateProviderResult(
        result({
          errors: [
            { operation: 'list', code: 'AccessDeniedException', retryable: false },
            { operation: 'launch', code: 'ThrottlingException', retryable: true },
          ],
        }),
        1,
      ),
    ).not.toThrow();
  });
});

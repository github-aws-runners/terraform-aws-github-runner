import {
  ScaleSetHttpError,
  ScaleSetProtocolError,
  type GitHubActionsScaleSetClientOptions,
  type RunnerScaleSetStatistic,
} from '@aws-github-runner/github-actions-scale-set';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  abortableSleep,
  calculateReconnectDelay,
  closeScaleSetSession,
  createScaleSetListenerDependencies,
  createScaleSetListenerRuntime,
  createScaleSetListenerRuntimeDependencies,
  isFatalScaleSetListenerError,
  loadScaleSetListenerConfig,
  runScaleSetListener,
  ScaleSetListenerConfigurationError,
  ScaleSetListenerHealth,
  startScaleSetHealthServer,
  type ScaleSetHealthServer,
  type ScaleSetListenerClient,
  type ScaleSetListenerDependencies,
  type ScaleSetListenerPlatformDependencies,
  type ScaleSetListenerRuntime,
  type ScaleSetListenerRuntimeDependencies,
  type ScaleSetListenerSession,
} from './ecs-listener';
import { ScaleSetReconciliationError } from './orchestrator';

function validEnvironment(): Record<string, string | undefined> {
  return {
    SCALE_SET_GITHUB_CONFIG_URL: 'https://github.com/octo-org',
    USER_AGENT: 'terraform-aws-github-runner/test',
    SCALE_SET_ID: '123',
    SCALE_SET_MIN_RUNNERS: '0',
    SCALE_SET_MAX_RUNNERS: '5',
    SCALE_SET_SESSION_OWNER: 'test/scale-set-123',
    PARAMETER_GITHUB_APP_ID_NAME: '/github/app/id',
    PARAMETER_GITHUB_APP_KEY_BASE64_NAME: '/github/app/key',
    SSM_TOKEN_PATH: '/github-action-runners/test/runners/config',
    SSM_PARAMETER_STORE_TAGS: '[{"Key":"Environment","Value":"test"}]',
    ENVIRONMENT: 'test',
    SUBNET_IDS: 'subnet-1,subnet-2',
    LAUNCH_TEMPLATE_NAME: 'github-runner',
    INSTANCE_TYPES: 'm7i.large,m6i.large',
    INSTANCE_TARGET_CAPACITY_TYPE: 'spot',
    SCALE_ERRORS: '[]',
    RUNNER_BOOT_TIME_IN_MINUTES: '15',
  };
}

function statistics(): RunnerScaleSetStatistic {
  return {
    totalAvailableJobs: 0,
    totalAcquiredJobs: 0,
    totalAssignedJobs: 0,
    totalRunningJobs: 0,
    totalRegisteredRunners: 0,
    totalBusyRunners: 0,
    totalIdleRunners: 0,
  };
}

function createSession(close = vi.fn<ScaleSetListenerSession['close']>().mockResolvedValue(undefined)) {
  const session: ScaleSetListenerSession = {
    session: {
      sessionId: 'session-id',
      ownerName: 'test/scale-set-123',
      messageQueueUrl: 'https://pipelines.actions.githubusercontent.com/messages',
      messageQueueAccessToken: 'message-token',
      statistics: statistics(),
    },
    close,
    getMessage: vi.fn().mockResolvedValue(null),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    acquireJobs: vi.fn().mockResolvedValue([]),
  };
  return session;
}

function createProvider(): ScaleSetListenerRuntime['provider'] {
  return {
    getCurrentRunners: vi.fn().mockResolvedValue(0),
    createRunners: vi.fn().mockResolvedValue({
      instances: [],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 0,
    }),
    terminateSurplusRunners: vi.fn().mockResolvedValue(0),
    markRunnerStarted: vi.fn().mockResolvedValue(undefined),
    terminateCompletedRunner: vi.fn().mockResolvedValue(undefined),
  };
}

function createClient(session: ScaleSetListenerSession): ScaleSetListenerClient {
  return {
    createMessageSessionClient: vi.fn().mockResolvedValue(session),
    generateJitRunnerConfig: vi.fn(),
    getRunnerByName: vi.fn(),
    removeRunner: vi.fn(),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('loadScaleSetListenerConfig', () => {
  it('loads one organization scale set and preserves the module empty-prefix default', () => {
    const config = loadScaleSetListenerConfig(validEnvironment());

    expect(config.orchestrator).toMatchObject({
      scaleSetId: 123,
      minRunners: 0,
      maxRunners: 5,
      workFolder: '_work',
      runnerConfig: {
        runnerOwner: 'octo-org',
        runnerType: 'Org',
        runnerNamePrefix: '',
        ssmTokenPath: '/github-action-runners/test/runners/config',
        ssmParameterStoreTags: [{ Key: 'Environment', Value: 'test' }],
      },
    });
    expect(config.githubApiBaseUrl).toBe('https://api.github.com');
    expect(config.userAgent).toBe('terraform-aws-github-runner/test');
    expect(config.githubAppIndex).toBe(0);
    expect(config.computeProviderType).toBe('ec2');
  });

  it('derives repository ownership and retains an explicitly configured prefix', () => {
    const environment = {
      ...validEnvironment(),
      SCALE_SET_GITHUB_CONFIG_URL: 'https://github.com/octo-org/example',
      RUNNER_NAME_PREFIX: 'scale-set-',
      SCALE_SET_GITHUB_APP_INDEX: '1',
      PARAMETER_GITHUB_APP_ID_NAME: '/github/app/one/id:/github/app/two/id',
      PARAMETER_GITHUB_APP_KEY_BASE64_NAME: '/github/app/one/key:/github/app/two/key',
    };

    const config = loadScaleSetListenerConfig(environment);

    expect(config.orchestrator.runnerConfig).toMatchObject({
      runnerOwner: 'octo-org/example',
      runnerType: 'Repo',
      runnerNamePrefix: 'scale-set-',
    });
    expect(config.githubAppIndex).toBe(1);
  });

  it('loads all optional host and EC2 validation values', () => {
    const config = loadScaleSetListenerConfig({
      ...validEnvironment(),
      SSM_PARAMETER_STORE_TAGS: undefined,
      SCALE_SET_WORK_FOLDER: ' custom-work ',
      SCALE_SET_HEALTH_PORT: '9090',
      SCALE_SET_HEALTH_STALE_MS: '600000',
      SCALE_SET_SESSION_CLOSE_TIMEOUT_MS: '20000',
      SCALE_SET_RECONNECT_INITIAL_BACKOFF_MS: '2000',
      SCALE_SET_RECONNECT_MAX_BACKOFF_MS: '40000',
      SCALE_SET_LISTENER_VERSION: '2.0.0',
      GIT_COMMIT_SHA: 'abc123',
      USER_AGENT: ' custom-scale-set-listener ',
      ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS: '["InsufficientInstanceCapacity"]',
      INSTANCE_TYPE_PRIORITIES: '{"m7i.large":1}',
    });

    expect(config).toMatchObject({
      healthPort: 9090,
      healthStaleMs: 600000,
      sessionCloseTimeoutMs: 20000,
      reconnectInitialBackoffMs: 2000,
      reconnectMaxBackoffMs: 40000,
      systemInfo: { version: '2.0.0', commitSha: 'abc123' },
      userAgent: 'custom-scale-set-listener',
      orchestrator: {
        workFolder: 'custom-work',
        runnerConfig: { ssmParameterStoreTags: [] },
      },
    });
  });

  it('rejects enterprise scope until the compute ownership contract supports it', () => {
    expect(() =>
      loadScaleSetListenerConfig({
        ...validEnvironment(),
        SCALE_SET_GITHUB_CONFIG_URL: 'https://github.com/enterprises/octo-enterprise',
      }),
    ).toThrow('Enterprise scale-set URLs are not supported');
  });

  it.each([
    [{ SCALE_SET_ID: '0' }, 'SCALE_SET_ID must be a positive integer'],
    [
      { SCALE_SET_MIN_RUNNERS: '6', SCALE_SET_MAX_RUNNERS: '5' },
      'SCALE_SET_MIN_RUNNERS cannot be greater than SCALE_SET_MAX_RUNNERS',
    ],
    [{ SCALE_SET_GITHUB_APP_INDEX: '1' }, 'SCALE_SET_GITHUB_APP_INDEX 1 does not select a configured GitHub App'],
    [
      { PARAMETER_GITHUB_APP_KEY_BASE64_NAME: '/github/app/one:/github/app/two' },
      'GitHub App parameter count mismatch',
    ],
    [{ INSTANCE_TARGET_CAPACITY_TYPE: 'reserved' }, 'INSTANCE_TARGET_CAPACITY_TYPE'],
    [{ SCALE_ERRORS: '{}' }, 'SCALE_ERRORS must be a JSON array of strings'],
    [{ SCALE_ERRORS: 'not-json' }, 'SCALE_ERRORS must contain valid JSON'],
    [{ SCALE_SET_HEALTH_PORT: '65536' }, 'SCALE_SET_HEALTH_PORT cannot be greater than 65535'],
    [{ SCALE_SET_WORK_FOLDER: ' ' }, 'SCALE_SET_WORK_FOLDER must be non-empty when set'],
    [{ SCALE_SET_MIN_RUNNERS: '-1' }, 'SCALE_SET_MIN_RUNNERS must be a non-negative integer'],
    [{ SCALE_SET_MAX_RUNNERS: '2147483648' }, 'SCALE_SET_MAX_RUNNERS cannot be greater'],
    [{ SCALE_SET_ID: '1.5' }, 'SCALE_SET_ID must be an integer'],
    [{ SCALE_SET_ID: '999999999999999999999' }, 'SCALE_SET_ID must be a safe integer'],
    [{ SCALE_SET_SESSION_OWNER: undefined }, 'SCALE_SET_SESSION_OWNER must be set'],
    [{ SUBNET_IDS: 'subnet-1,' }, 'SUBNET_IDS must contain only non-empty comma-separated values'],
    [
      { ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS: '{}' },
      'ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS must be a JSON array of strings',
    ],
    [{ INSTANCE_TYPE_PRIORITIES: '[]' }, 'INSTANCE_TYPE_PRIORITIES must be a JSON object'],
    [{ INSTANCE_TYPE_PRIORITIES: '{"m7i.large":"first"}' }, 'finite numeric values'],
    [{ RUNNER_BOOT_TIME_IN_MINUTES: 'NaN' }, 'RUNNER_BOOT_TIME_IN_MINUTES must be a positive number'],
    [
      { SCALE_SET_RECONNECT_INITIAL_BACKOFF_MS: '5000', SCALE_SET_RECONNECT_MAX_BACKOFF_MS: '1000' },
      'SCALE_SET_RECONNECT_INITIAL_BACKOFF_MS cannot be greater',
    ],
  ])('fails before session creation for invalid configuration', (overrides, expected) => {
    expect(() => loadScaleSetListenerConfig({ ...validEnvironment(), ...overrides })).toThrow(expected);
  });

  it('wraps lower-level URL parsing errors as fatal configuration errors', () => {
    expect(() =>
      loadScaleSetListenerConfig({ ...validEnvironment(), SCALE_SET_GITHUB_CONFIG_URL: 'not-a-url' }),
    ).toThrow(ScaleSetListenerConfigurationError);
  });
});

describe('createScaleSetListenerRuntimeDependencies', () => {
  it('wires existing auth, installation resolution, client, and provider adapters', async () => {
    const organizationConfig = loadScaleSetListenerConfig(validEnvironment());
    const repositoryConfig = loadScaleSetListenerConfig({
      ...validEnvironment(),
      SCALE_SET_GITHUB_CONFIG_URL: 'https://github.com/octo-org/example',
    });
    const session = createSession();
    const client = createClient(session);
    const provider = createProvider();
    const getOrgInstallation = vi.fn().mockResolvedValue({ data: { id: 101 } });
    const getRepoInstallation = vi.fn().mockResolvedValue({ data: { id: 202 } });
    const platform: ScaleSetListenerPlatformDependencies = {
      createGithubAppAuth: vi.fn().mockResolvedValue({ token: 'app-jwt', appIndex: 1 } as never),
      createGithubInstallationAuth: vi.fn().mockResolvedValue({
        token: 'installation-token',
        expiresAt: '2030-01-01T00:00:00.000Z',
      } as never),
      createOctokitClient: vi.fn().mockResolvedValue({
        apps: { getOrgInstallation, getRepoInstallation },
      } as never),
      getStoredInstallationId: vi.fn().mockResolvedValue(303),
      createClient: vi.fn().mockReturnValue(client),
      createProvider: vi.fn().mockReturnValue(provider),
    };
    const dependencies = createScaleSetListenerRuntimeDependencies(platform);

    await expect(dependencies.selectGitHubApp('https://api.github.com', 1)).resolves.toEqual({
      token: 'app-jwt',
      appIndex: 1,
    });
    await expect(dependencies.getStoredInstallationId(1)).resolves.toBe(303);
    await expect(
      dependencies.resolveInstallationId(
        organizationConfig.githubConfig,
        'app-jwt',
        organizationConfig.githubApiBaseUrl,
      ),
    ).resolves.toBe(101);
    await expect(
      dependencies.resolveInstallationId(repositoryConfig.githubConfig, 'app-jwt', repositoryConfig.githubApiBaseUrl),
    ).resolves.toBe(202);
    await expect(dependencies.createInstallationToken(303, 'https://api.github.com', 1)).resolves.toEqual({
      token: 'installation-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(
      dependencies.createClient({
        gitHubConfigUrl: 'https://github.com/octo-org',
        personalAccessToken: 'test-token',
      }),
    ).toBe(client);
    expect(dependencies.createProvider('ec2')).toBe(provider);
    expect(getOrgInstallation).toHaveBeenCalledWith({ org: 'octo-org' });
    expect(getRepoInstallation).toHaveBeenCalledWith({ owner: 'octo-org', repo: 'example' });
  });

  it('fails closed for an unsupported parsed scope', async () => {
    const platform: ScaleSetListenerPlatformDependencies = {
      createGithubAppAuth: vi.fn(),
      createGithubInstallationAuth: vi.fn(),
      createOctokitClient: vi.fn().mockResolvedValue({ apps: {} } as never),
      getStoredInstallationId: vi.fn(),
      createClient: vi.fn(),
      createProvider: vi.fn(),
    };
    const dependencies = createScaleSetListenerRuntimeDependencies(platform);

    await expect(
      dependencies.resolveInstallationId(
        {
          configUrl: new URL('https://github.com/enterprises/octo'),
          scope: 'enterprise',
          enterprise: 'octo',
          isHosted: true,
        },
        'app-jwt',
        'https://api.github.com',
      ),
    ).rejects.toThrow('Cannot resolve a GitHub App installation');
  });

  it('constructs the default scale-set client and registered EC2 provider without I/O', () => {
    const dependencies = createScaleSetListenerRuntimeDependencies();

    expect(
      dependencies.createClient({
        gitHubConfigUrl: 'https://github.com/octo-org',
        personalAccessToken: 'test-token',
      }),
    ).toMatchObject({ gitHubConfig: expect.any(Object) });
    expect(dependencies.createProvider('ec2')).toMatchObject({
      createRunners: expect.any(Function),
      getCurrentRunners: expect.any(Function),
    });
  });
});

describe('createScaleSetListenerRuntime', () => {
  it('reuses a stored installation ID and refreshes installation tokens through the selected app', async () => {
    const config = loadScaleSetListenerConfig(validEnvironment());
    const session = createSession();
    const client = createClient(session);
    const provider = createProvider();
    let clientOptions: GitHubActionsScaleSetClientOptions | undefined;
    const dependencies: ScaleSetListenerRuntimeDependencies = {
      selectGitHubApp: vi.fn().mockResolvedValue({ token: 'app-jwt', appIndex: 0 }),
      getStoredInstallationId: vi.fn().mockResolvedValue(456),
      resolveInstallationId: vi.fn().mockResolvedValue(999),
      createInstallationToken: vi.fn().mockResolvedValue({
        token: 'installation-token',
        expiresAt: '2030-01-01T00:00:00.000Z',
      }),
      createClient: (options) => {
        clientOptions = options;
        return client;
      },
      createProvider: vi.fn().mockReturnValue(provider),
    };

    const runtime = await createScaleSetListenerRuntime(config, undefined, dependencies);

    expect(runtime).toEqual({ client, session, provider });
    expect(dependencies.resolveInstallationId).not.toHaveBeenCalled();
    expect(client.createMessageSessionClient).toHaveBeenCalledWith(123, 'test/scale-set-123', {
      signal: undefined,
    });
    expect(clientOptions).toBeDefined();
    expect(clientOptions).toMatchObject({ userAgent: 'terraform-aws-github-runner/test' });
    if (!clientOptions || !('accessTokenProvider' in clientOptions) || !clientOptions.accessTokenProvider) {
      throw new Error('Expected an access-token provider');
    }
    await expect(clientOptions.accessTokenProvider()).resolves.toEqual({
      token: 'installation-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    expect(dependencies.createInstallationToken).toHaveBeenCalledWith(456, 'https://api.github.com', 0);
  });

  it('resolves a missing installation ID with the app JWT and rejects invalid IDs', async () => {
    const config = loadScaleSetListenerConfig(validEnvironment());
    const dependencies: ScaleSetListenerRuntimeDependencies = {
      selectGitHubApp: vi.fn().mockResolvedValue({ token: 'app-jwt', appIndex: 0 }),
      getStoredInstallationId: vi.fn().mockResolvedValue(undefined),
      resolveInstallationId: vi.fn().mockResolvedValue(0),
      createInstallationToken: vi.fn(),
      createClient: vi.fn(),
      createProvider: vi.fn().mockReturnValue(createProvider()),
    };

    await expect(createScaleSetListenerRuntime(config, undefined, dependencies)).rejects.toThrow(
      'installation ID must be positive',
    );
    expect(dependencies.resolveInstallationId).toHaveBeenCalledWith(
      config.githubConfig,
      'app-jwt',
      'https://api.github.com',
    );

    vi.mocked(dependencies.resolveInstallationId).mockResolvedValueOnce(Number.NaN);
    await expect(createScaleSetListenerRuntime(config, undefined, dependencies)).rejects.toThrow(
      'installation ID must be positive',
    );
  });
});

describe('runScaleSetListener', () => {
  it('closes each failed session, waits with bounded backoff, and reconnects until shutdown', async () => {
    const config = loadScaleSetListenerConfig(validEnvironment());
    const controller = new AbortController();
    const sessions = [createSession(), createSession()];
    const runtimes = sessions.map((session) => ({
      client: createClient(session),
      session,
      provider: createProvider(),
    }));
    const closeSignals: AbortSignal[] = [];
    const runPollLoop = vi
      .fn<ScaleSetListenerDependencies['runPollLoop']>()
      .mockImplementationOnce(async ({ onPoll }) => {
        await onPoll?.({
          state: { initialized: true, lastMessageId: 1 },
          acquiredRequestIds: [],
          startedRunnerNames: [],
          completedRunnerNames: [],
          reconciliations: [],
        });
        throw new Error('temporary network failure');
      })
      .mockImplementationOnce(async () => {
        controller.abort();
        return { initialized: true, lastMessageId: 0 };
      });
    const dependencies: ScaleSetListenerDependencies = {
      createRuntime: vi.fn().mockResolvedValueOnce(runtimes[0]).mockResolvedValueOnce(runtimes[1]),
      runPollLoop,
      sleep: vi.fn().mockResolvedValue(undefined),
      random: () => 1,
      createCloseSignal: vi.fn().mockImplementation(() => {
        const signal = new AbortController().signal;
        closeSignals.push(signal);
        return signal;
      }),
      isFatal: isFatalScaleSetListenerError,
      logger: { info: vi.fn(), warn: vi.fn() },
      health: {
        markSessionReady: vi.fn(),
        markProgress: vi.fn(),
        markFailure: vi.fn(),
      },
    };

    await runScaleSetListener(config, controller.signal, dependencies);

    expect(dependencies.createRuntime).toHaveBeenCalledTimes(2);
    expect(dependencies.sleep).toHaveBeenCalledWith(1000, controller.signal);
    expect(sessions[0].close).toHaveBeenCalledTimes(1);
    expect(sessions[1].close).toHaveBeenCalledTimes(1);
    expect(closeSignals).toHaveLength(2);
    expect(closeSignals.every((signal) => !signal.aborted)).toBe(true);
    expect(dependencies.health.markSessionReady).toHaveBeenCalledTimes(2);
    expect(dependencies.health.markProgress).toHaveBeenCalledTimes(1);
  });

  it('stays unhealthy when every recreated session fails before its first successful poll', async () => {
    const config = loadScaleSetListenerConfig(validEnvironment());
    const controller = new AbortController();
    let now = 0;
    const health = new ScaleSetListenerHealth(config.healthStaleMs, () => now);
    const sessions: ScaleSetListenerSession[] = [];
    let reconnects = 0;
    const dependencies: ScaleSetListenerDependencies = {
      createRuntime: vi.fn().mockImplementation(async () => {
        const session = createSession();
        sessions.push(session);
        return { client: createClient(session), session, provider: createProvider() };
      }),
      runPollLoop: vi.fn().mockRejectedValue(new Error('first queue poll failed')),
      sleep: vi.fn().mockImplementation(async () => {
        reconnects++;
        now += Math.ceil(config.healthStaleMs / 2);
        if (reconnects === 3) controller.abort();
      }),
      random: () => 0,
      createCloseSignal: () => new AbortController().signal,
      isFatal: isFatalScaleSetListenerError,
      logger: { info: vi.fn(), warn: vi.fn() },
      health,
    };

    await runScaleSetListener(config, controller.signal, dependencies);

    expect(dependencies.createRuntime).toHaveBeenCalledTimes(3);
    expect(dependencies.runPollLoop).toHaveBeenCalledTimes(3);
    expect(sessions).toHaveLength(3);
    expect(sessions.every((session) => vi.mocked(session.close).mock.calls.length === 1)).toBe(true);
    expect(health.snapshot()).toMatchObject({
      healthy: false,
      status: 'stale',
      consecutiveFailures: 3,
      lastErrorName: 'Error',
    });
    expect(health.snapshot()).not.toHaveProperty('lastProgressAt');
  });

  it('closes the session and exits nonzero through its caller on fatal protocol errors', async () => {
    const config = loadScaleSetListenerConfig(validEnvironment());
    const controller = new AbortController();
    const session = createSession();
    const dependencies: ScaleSetListenerDependencies = {
      createRuntime: vi.fn().mockResolvedValue({
        client: createClient(session),
        session,
        provider: createProvider(),
      }),
      runPollLoop: vi.fn().mockRejectedValue(new ScaleSetProtocolError('invalid message contract')),
      sleep: vi.fn(),
      random: () => 0,
      createCloseSignal: () => new AbortController().signal,
      isFatal: isFatalScaleSetListenerError,
      logger: { info: vi.fn(), warn: vi.fn() },
      health: {
        markSessionReady: vi.fn(),
        markProgress: vi.fn(),
        markFailure: vi.fn(),
      },
    };

    await expect(runScaleSetListener(config, controller.signal, dependencies)).rejects.toThrow(
      'invalid message contract',
    );
    expect(session.close).toHaveBeenCalledTimes(1);
    expect(dependencies.sleep).not.toHaveBeenCalled();
    expect(dependencies.health.markFailure).toHaveBeenCalledWith(expect.any(ScaleSetProtocolError), true);
  });

  it('reconnects when a poll loop returns unexpectedly', async () => {
    const config = loadScaleSetListenerConfig(validEnvironment());
    const controller = new AbortController();
    const session = createSession();
    const dependencies: ScaleSetListenerDependencies = {
      createRuntime: vi.fn().mockResolvedValue({
        client: createClient(session),
        session,
        provider: createProvider(),
      }),
      runPollLoop: vi.fn().mockResolvedValue({ initialized: true, lastMessageId: 0 }),
      sleep: vi.fn().mockImplementation(async () => controller.abort()),
      random: () => 0,
      createCloseSignal: () => new AbortController().signal,
      isFatal: isFatalScaleSetListenerError,
      logger: { info: vi.fn(), warn: vi.fn() },
      health: {
        markSessionReady: vi.fn(),
        markProgress: vi.fn(),
        markFailure: vi.fn(),
      },
    };

    await runScaleSetListener(config, controller.signal, dependencies);

    expect(dependencies.logger.warn).toHaveBeenCalledWith(
      'Scale-set listener failed; recreating the message session',
      expect.objectContaining({ consecutiveFailures: 1 }),
    );
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('handles shutdown while the poll loop is rejecting', async () => {
    const config = loadScaleSetListenerConfig(validEnvironment());
    const controller = new AbortController();
    const session = createSession();
    const dependencies: ScaleSetListenerDependencies = {
      createRuntime: vi.fn().mockResolvedValue({
        client: createClient(session),
        session,
        provider: createProvider(),
      }),
      runPollLoop: vi.fn().mockImplementation(async () => {
        controller.abort();
        throw new Error('poll aborted');
      }),
      sleep: vi.fn(),
      random: () => 0,
      createCloseSignal: () => new AbortController().signal,
      isFatal: isFatalScaleSetListenerError,
      logger: { info: vi.fn(), warn: vi.fn() },
      health: {
        markSessionReady: vi.fn(),
        markProgress: vi.fn(),
        markFailure: vi.fn(),
      },
    };

    await runScaleSetListener(config, controller.signal, dependencies);

    expect(dependencies.health.markFailure).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalledTimes(1);
  });

  it('backs off when session creation fails before there is a session to close', async () => {
    const config = loadScaleSetListenerConfig(validEnvironment());
    const controller = new AbortController();
    const dependencies: ScaleSetListenerDependencies = {
      createRuntime: vi.fn().mockRejectedValue('temporary auth service failure'),
      runPollLoop: vi.fn(),
      sleep: vi.fn().mockImplementation(async () => controller.abort()),
      random: () => 0,
      createCloseSignal: () => new AbortController().signal,
      isFatal: isFatalScaleSetListenerError,
      logger: { info: vi.fn(), warn: vi.fn() },
      health: {
        markSessionReady: vi.fn(),
        markProgress: vi.fn(),
        markFailure: vi.fn(),
      },
    };

    await runScaleSetListener(config, controller.signal, dependencies);

    expect(dependencies.logger.warn).toHaveBeenCalledWith(
      'Scale-set listener failed; recreating the message session',
      expect.objectContaining({ error: 'temporary auth service failure' }),
    );
  });
});

describe('listener lifecycle helpers', () => {
  it('caps equal-jitter reconnect backoff', () => {
    expect(calculateReconnectDelay(1, 1000, 30_000, () => 0)).toBe(500);
    expect(calculateReconnectDelay(2, 1000, 30_000, () => 1)).toBe(2000);
    expect(calculateReconnectDelay(100, 1000, 30_000, () => 1)).toBe(30_000);
  });

  it('rejects invalid reconnect parameters', () => {
    expect(() => calculateReconnectDelay(0, 1000, 30_000)).toThrow('attempt must be a positive integer');
    expect(() => calculateReconnectDelay(1, 0, 30_000)).toThrow('initialBackoffMs must be positive');
    expect(() => calculateReconnectDelay(1, 1000, 999)).toThrow('maxBackoffMs must be at least');
  });

  it('supports timer completion and abort for reconnect sleeps', async () => {
    vi.useFakeTimers();
    const completed = abortableSleep(100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(completed).resolves.toBeUndefined();

    const controller = new AbortController();
    const aborted = abortableSleep(1000, controller.signal);
    controller.abort();
    await expect(aborted).resolves.toBeUndefined();
    await expect(abortableSleep(0)).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it('uses an independent bounded signal when closing a session', async () => {
    const parent = new AbortController();
    parent.abort();
    const close = vi.fn<ScaleSetListenerSession['close']>().mockImplementation(async ({ signal } = {}) => {
      expect(signal).not.toBe(parent.signal);
      expect(signal?.aborted).toBe(false);
    });
    const createCloseSignal = vi.fn().mockReturnValue(new AbortController().signal);

    await closeScaleSetSession(createSession(close), 12_345, createCloseSignal, {
      info: vi.fn(),
      warn: vi.fn(),
    });

    expect(createCloseSignal).toHaveBeenCalledWith(12_345);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('logs session close failures without replacing the listener failure', async () => {
    const warn = vi.fn();
    await closeScaleSetSession(
      createSession(vi.fn().mockRejectedValue('close failed')),
      1000,
      () => new AbortController().signal,
      { info: vi.fn(), warn },
    );

    expect(warn).toHaveBeenCalledWith('Failed to close GitHub scale-set message session', {
      error: 'close failed',
    });

    await closeScaleSetSession(
      createSession(vi.fn().mockRejectedValue(new Error('close error'))),
      1000,
      () => new AbortController().signal,
      { info: vi.fn(), warn },
    );
    expect(warn).toHaveBeenCalledWith('Failed to close GitHub scale-set message session', {
      error: 'close error',
    });
  });

  it('classifies fatal configuration and protocol failures', () => {
    expect(isFatalScaleSetListenerError(new ScaleSetListenerConfigurationError('bad config'))).toBe(true);
    expect(isFatalScaleSetListenerError(new ScaleSetProtocolError('bad payload'))).toBe(true);
    expect(
      isFatalScaleSetListenerError(
        new ScaleSetHttpError({
          method: 'POST',
          url: 'https://example.test/session',
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers(),
          responseBody: '',
        }),
      ),
    ).toBe(true);
    expect(
      isFatalScaleSetListenerError(
        new ScaleSetHttpError({
          method: 'POST',
          url: 'https://example.test/session',
          status: 403,
          statusText: 'Forbidden',
          headers: new Headers(),
          responseBody: '',
        }),
      ),
    ).toBe(true);
    expect(isFatalScaleSetListenerError({ status: 404 })).toBe(true);
    expect(isFatalScaleSetListenerError({ status: 415 })).toBe(true);
    expect(isFatalScaleSetListenerError({ status: 409 })).toBe(false);
    expect(isFatalScaleSetListenerError({ status: 429 })).toBe(false);
    expect(isFatalScaleSetListenerError({ status: 503 })).toBe(false);
    expect(isFatalScaleSetListenerError(new Error('network'))).toBe(false);
  });

  it('classifies only non-retryable provider creation failures as fatal', () => {
    expect(
      isFatalScaleSetListenerError(
        new ScaleSetReconciliationError(2, {
          instances: ['i-created'],
          retryableErrorCount: 1,
          nonRetryableErrorCount: 0,
        }),
      ),
    ).toBe(false);
    expect(
      isFatalScaleSetListenerError(
        new ScaleSetReconciliationError(2, {
          instances: ['i-created'],
          retryableErrorCount: 0,
          nonRetryableErrorCount: 1,
        }),
      ),
    ).toBe(true);
  });

  it('creates production listener dependencies with a no-op health reporter by default', () => {
    const dependencies = createScaleSetListenerDependencies();
    dependencies.health.markSessionReady();
    dependencies.health.markProgress();
    dependencies.health.markFailure(new Error('ignored'), false);
    dependencies.logger.info('listener info');
    dependencies.logger.info('listener info', { scaleSetId: 123 });
    dependencies.logger.warn('listener warning');
    dependencies.logger.warn('listener warning', { scaleSetId: 123 });
    expect(dependencies.createRuntime).toBeTypeOf('function');
  });
});

describe('scale-set listener health server', () => {
  let server: ScaleSetHealthServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('reports startup, progress, reconnect, stale, and stopping state over loopback', async () => {
    let now = Date.parse('2026-08-14T12:00:00.000Z');
    const health = new ScaleSetListenerHealth(100, () => now);
    server = await startScaleSetHealthServer(health, 0);
    const url = `http://127.0.0.1:${server.port}/healthz`;

    const starting = await fetch(url);
    expect(starting.status).toBe(503);
    expect(await starting.json()).toMatchObject({ healthy: false, status: 'starting' });

    const notFound = await fetch(`${url}/missing`);
    expect(notFound.status).toBe(404);

    health.markSessionReady();
    const sessionReady = await fetch(url);
    expect(sessionReady.status).toBe(200);
    expect(await sessionReady.json()).toMatchObject({ healthy: true, status: 'starting' });

    health.markProgress();
    const ready = await fetch(url);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toMatchObject({ healthy: true, status: 'healthy' });

    health.markFailure(new Error('temporary'), false);
    const reconnecting = await fetch(url);
    expect(reconnecting.status).toBe(200);
    expect(await reconnecting.json()).toMatchObject({ healthy: true, status: 'reconnecting' });

    now += 101;
    const stale = await fetch(url);
    expect(stale.status).toBe(503);
    expect(await stale.json()).toMatchObject({ healthy: false, status: 'stale' });

    health.markStopping();
    const stopping = await fetch(url);
    expect(stopping.status).toBe(503);
    expect(await stopping.json()).toMatchObject({ healthy: false, status: 'stopping' });

    await server.close();
    await server.close();
    server = undefined;
  });

  it('reports a fatal health state without exposing the error message', async () => {
    const health = new ScaleSetListenerHealth(1000, () => 0);
    health.markProgress();
    health.markFailure('secret failure details', true);

    expect(health.snapshot()).toMatchObject({
      healthy: false,
      status: 'fatal',
      lastErrorName: 'string',
    });
    expect(JSON.stringify(health.snapshot())).not.toContain('secret failure details');
  });

  it('rejects a second server binding to the same loopback port', async () => {
    const health = new ScaleSetListenerHealth(1000);
    server = await startScaleSetHealthServer(health, 0);

    await expect(startScaleSetHealthServer(health, server.port)).rejects.toThrow(/EADDRINUSE/);
  });
});

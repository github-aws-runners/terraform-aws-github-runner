import { mkdtemp, rm, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { arch, tmpdir, type } from 'node:os';
import { join } from 'node:path';

import type { JitConfigSource, Logger, ManagedProcess, RunContext, RunnerBootstrap, RunnerLauncher } from './contracts';
import { RunnerLifecycle } from './lifecycle';

const quietLogger: Logger = {
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

const MICROVM_ID = 'microvm-bdd2d536-3d87-35e4-8b40-18664608ebc1';

afterEach(() => {
  vi.restoreAllMocks();
});

function overrideEnvironment(overrides: Record<string, string | undefined>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(overrides)) {
    previous.set(name, process.env[name]);
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  return (): void => {
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };
}

function runRequest(
  payload: object = {
    imageArn: 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner',
    imageVersion: '8.0',
    runnerConfigSsmPath: '/runner/config',
    runnerTokenSsmPath: '/runner/token',
    version: 1,
  },
): string {
  return JSON.stringify({
    microvmId: MICROVM_ID,
    runHookPayload: JSON.stringify(payload),
  });
}

class DeferredProcess implements ManagedProcess {
  public readonly ready = Promise.resolve();
  public readonly exit: Promise<number | null>;
  public exited = false;
  private resolveExit!: (code: number | null) => void;

  public constructor() {
    this.exit = new Promise((resolve) => {
      this.resolveExit = resolve;
    });
  }

  public finish(code: number | null): void {
    this.exited = true;
    this.resolveExit(code);
  }

  public async stop(): Promise<void> {
    if (!this.exited) {
      this.finish(null);
    }
  }
}

describe('RunnerLifecycle', () => {
  it('writes setup information before launching the runner', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'microvm-lifecycle-setup-info-'));
    const restoreEnvironment = overrideEnvironment({ ACTIONS_RUNNER_ROOT: directory });
    let setupInfoAtLaunch: unknown;
    const launcher: RunnerLauncher = {
      launch(): ManagedProcess {
        setupInfoAtLaunch = JSON.parse(readFileSync(join(directory, '.setup_info'), 'utf8'));
        return new DeferredProcess();
      },
    };

    try {
      const lifecycle = new RunnerLifecycle(
        { consume: async () => ({ jitConfig: 'encoded-jit' }) },
        launcher,
        quietLogger,
      );

      await lifecycle.start(runRequest());

      expect(setupInfoAtLaunch).toEqual([
        {
          group: 'Operating System',
          detail: `Platform: ${type()}\nArchitecture: ${arch()}`,
        },
        {
          group: 'Runner Image',
          detail:
            'MicroVM image ARN: arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner\nMicroVM image version: 8.0',
        },
        {
          group: 'Lambda MicroVM',
          detail: `MicroVM id: ${MICROVM_ID}`,
        },
      ]);
      expect((await stat(join(directory, '.setup_info'))).mode & 0o777).toBe(0o644);
    } finally {
      restoreEnvironment();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('writes available setup information without image metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'microvm-lifecycle-setup-info-'));
    const restoreEnvironment = overrideEnvironment({ ACTIONS_RUNNER_ROOT: directory });
    let setupInfoAtLaunch: unknown;
    const launcher: RunnerLauncher = {
      launch(): ManagedProcess {
        setupInfoAtLaunch = JSON.parse(readFileSync(join(directory, '.setup_info'), 'utf8'));
        return new DeferredProcess();
      },
    };

    try {
      const lifecycle = new RunnerLifecycle(
        { consume: async () => ({ jitConfig: 'encoded-jit' }) },
        launcher,
        quietLogger,
      );

      await lifecycle.start(
        runRequest({
          runnerConfigSsmPath: '/runner/config',
          runnerTokenSsmPath: '/runner/token',
          version: 1,
        }),
      );

      expect(setupInfoAtLaunch).toEqual([
        {
          group: 'Operating System',
          detail: `Platform: ${type()}\nArchitecture: ${arch()}`,
        },
        {
          group: 'Lambda MicroVM',
          detail: `MicroVM id: ${MICROVM_ID}`,
        },
      ]);
    } finally {
      restoreEnvironment();
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('starts only once and waits for terminate cleanup after the runner exits', async () => {
    const events: string[] = [];
    const processHandle = new DeferredProcess();
    const source: JitConfigSource = {
      async consume(context: RunContext): Promise<RunnerBootstrap> {
        events.push(`consume:${context.storage.RUNNER_CONFIG_STORAGE_PROVIDER}:${context.microvmId}`);
        return { jitConfig: 'encoded-jit' };
      },
    };
    const launcher: RunnerLauncher = {
      launch(bootstrap, id): ManagedProcess {
        events.push(`launch:${id}:${bootstrap.jitConfig}`);
        return processHandle;
      },
    };
    const lifecycle = new RunnerLifecycle(source, launcher, quietLogger);

    await expect(lifecycle.start(runRequest())).resolves.toBe(true);
    await expect(lifecycle.start(runRequest())).resolves.toBe(false);
    expect(events).toEqual([`consume:aws_ssm:${MICROVM_ID}`, `launch:${MICROVM_ID}:encoded-jit`]);

    processHandle.finish(0);
    await expect(lifecycle.completion).resolves.toBe(0);
    await lifecycle.stop();
    expect(processHandle.exited).toBe(true);
  });

  it('does not report an externally requested stop as runner self-completion', async () => {
    const processHandle = new DeferredProcess();
    const lifecycle = new RunnerLifecycle(
      { consume: async () => ({ jitConfig: 'encoded-jit' }) },
      { launch: () => processHandle },
      quietLogger,
    );

    await lifecycle.start(runRequest());
    await lifecycle.stop();

    await expect(
      Promise.race([
        lifecycle.completion.then(() => 'completed'),
        new Promise<string>((resolve) => setImmediate(() => resolve('pending'))),
      ]),
    ).resolves.toBe('pending');
  });

  it('reserves the runner startup budget before consuming configuration', async () => {
    let consumeDeadline = 0;
    const processHandle = new DeferredProcess();
    const lifecycle = new RunnerLifecycle(
      {
        async consume(_context, options): Promise<RunnerBootstrap> {
          consumeDeadline = options.deadlineMs;
          return { jitConfig: 'encoded-jit' };
        },
      },
      { launch: () => processHandle },
      quietLogger,
    );
    vi.spyOn(Date, 'now').mockReturnValue(1_000);

    await lifecycle.start(runRequest());

    expect(consumeDeadline).toBe(21_000);
    await lifecycle.stop();
  });

  it('returns to idle if the GitHub Actions runner cannot launch', async () => {
    const consume = vi.fn().mockResolvedValue({ jitConfig: 'encoded-jit' });
    const lifecycle = new RunnerLifecycle(
      { consume },
      {
        launch(): ManagedProcess {
          throw new Error('spawn failed');
        },
      },
      quietLogger,
    );

    await expect(lifecycle.start(runRequest())).rejects.toThrow('spawn failed');
    await expect(lifecycle.start(runRequest())).rejects.toThrow('spawn failed');
    expect(consume).toHaveBeenCalledTimes(2);
  });

  it('logs the startup stage and safe error details without exposing internal messages', async () => {
    const messages: unknown[] = [];
    const logger: Logger = {
      error: (...values) => messages.push(...values),
      info: () => undefined,
      warn: () => undefined,
    };
    const error = new Error('encoded-jit-secret');
    error.name = 'encoded-jit-secret-name';
    Object.assign(error, { code: 'encoded-jit-secret-code' });
    const lifecycle = new RunnerLifecycle(
      {
        consume: async () => {
          throw error;
        },
      },
      { launch: () => new DeferredProcess() },
      logger,
    );

    await expect(lifecycle.start(runRequest())).rejects.toBe(error);

    const serializedMessages = JSON.stringify(messages);
    expect(serializedMessages).toContain('consume runner configuration');
    expect(serializedMessages).toContain('unknown-error');
    expect(serializedMessages).not.toContain('encoded-jit-secret');
  });

  it('aborts in-flight consumption when the run-hook deadline elapses', async () => {
    let consumedSignal: AbortSignal | undefined;
    let launched = false;
    let releaseConsume = (): void => undefined;
    const consumption = new Promise<void>((resolve) => {
      releaseConsume = resolve;
    });
    const lifecycle = new RunnerLifecycle(
      {
        async consume(_context, options): Promise<RunnerBootstrap> {
          consumedSignal = options.signal;
          await consumption;
          return { jitConfig: 'encoded-jit' };
        },
      },
      {
        launch(): ManagedProcess {
          launched = true;
          return new DeferredProcess();
        },
      },
      quietLogger,
    );
    let calls = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => (calls++ === 0 ? 1_000 : 61_000));

    await expect(lifecycle.start(runRequest())).rejects.toThrow('run-hook deadline elapsed');
    releaseConsume();
    await new Promise((resolve) => setImmediate(resolve));

    expect(consumedSignal?.aborted).toBe(true);
    expect(launched).toBe(false);
  });

  it('waits for cleanup when terminate races with the runner launch handoff', async () => {
    let finishCleanup = (): void => undefined;
    let reportLaunched = (): void => undefined;
    let stopCalled = false;
    const cleanup = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    const launched = new Promise<void>((resolve) => {
      reportLaunched = resolve;
    });
    const processHandle: ManagedProcess = {
      ready: new Promise<void>(() => undefined),
      exit: new Promise<number | null>(() => undefined),
      exited: false,
      async stop(): Promise<void> {
        stopCalled = true;
        await cleanup;
      },
    };
    const lifecycle = new RunnerLifecycle(
      { consume: async () => ({ jitConfig: 'encoded-jit' }) },
      {
        launch(): ManagedProcess {
          reportLaunched();
          return processHandle;
        },
      },
      quietLogger,
    );

    const rejectedStart = expect(lifecycle.start(runRequest())).rejects.toThrow('runner start was cancelled');
    await launched;
    let terminateSettled = false;
    const terminate = lifecycle.stop().then(() => {
      terminateSettled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(stopCalled).toBe(true);
    expect(terminateSettled).toBe(false);

    finishCleanup();
    await terminate;
    await rejectedStart;
    expect(terminateSettled).toBe(true);
  });
});

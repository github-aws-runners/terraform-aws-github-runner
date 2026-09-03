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

function runRequest(): string {
  return JSON.stringify({
    microvmId: MICROVM_ID,
    runHookPayload: JSON.stringify({
      runnerConfigSsmPath: '/runner/token',
      version: 1,
    }),
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

  it('returns to idle if the configured entrypoint cannot launch', async () => {
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

  it('waits for cleanup when terminate races with entrypoint readiness', async () => {
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

import type { JitConfigSource, Logger, ManagedProcess, RunnerBootstrap, RunnerLauncher } from './contracts';
import { consoleLogger } from './contracts';
import { parseRunRequest } from './payload';
import { beforeDeadline, beforeDeadlineOrAbort } from './timing';

type LifecycleState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped';

function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

export class RunnerLifecycle {
  private readonly runHookBudgetMs = boundedNumber(process.env.RUN_HOOK_TIMEOUT_SECONDS, 55, 40, 55) * 1_000;
  // Reserve Lambda's 30-second service readiness window plus five seconds of local margin.
  private readonly launchReserveMs = 35_000;
  private state: LifecycleState = 'idle';
  private microvmId?: string;
  private startAbort?: AbortController;
  private startPromise?: Promise<void>;
  private runner?: ManagedProcess;

  public constructor(
    private readonly jitConfigSource: JitConfigSource,
    private readonly launcher: RunnerLauncher,
    private readonly logger: Logger = consoleLogger,
  ) {}

  private currentState(): LifecycleState {
    return this.state;
  }

  public async start(body: string): Promise<boolean> {
    const context = parseRunRequest(body);
    const deadlineMs = Date.now() + this.runHookBudgetMs;

    if (this.microvmId === context.microvmId && this.state === 'running') {
      return false;
    }
    if (this.microvmId === context.microvmId && this.state === 'starting') {
      if (this.startPromise === undefined) {
        throw new Error('runner start state is inconsistent');
      }
      await beforeDeadline(this.startPromise, deadlineMs);
      if (this.currentState() === 'running') {
        return false;
      }
      throw new Error('the preceding runner start did not succeed');
    }
    if (this.state !== 'idle') {
      throw new Error('another runner lifecycle is already active in this MicroVM');
    }

    const abort = new AbortController();
    this.state = 'starting';
    this.microvmId = context.microvmId;
    this.startAbort = abort;
    const startOperation = this.startRunner(context, deadlineMs, abort);
    this.startPromise = startOperation;
    const clearStartPromise = (): void => {
      if (this.startPromise === startOperation) {
        this.startPromise = undefined;
      }
    };
    void startOperation.then(clearStartPromise, clearStartPromise);
    try {
      await beforeDeadline(startOperation, deadlineMs);
      return true;
    } catch (error) {
      // Cancel the underlying work so a timed-out hook cannot register a runner later.
      abort.abort();
      throw error;
    }
  }

  private async startRunner(
    context: ReturnType<typeof parseRunRequest>,
    deadlineMs: number,
    abort: AbortController,
  ): Promise<void> {
    let bootstrap: RunnerBootstrap | undefined;
    let processHandle: ManagedProcess | undefined;
    try {
      bootstrap = await this.jitConfigSource.consume(context, {
        deadlineMs: deadlineMs - this.launchReserveMs,
        signal: abort.signal,
      });
      if (abort.signal.aborted) {
        throw new Error('runner start was cancelled');
      }

      processHandle = this.launcher.launch(bootstrap, context.microvmId);
      await beforeDeadlineOrAbort(processHandle.ready, deadlineMs, abort.signal);
      if (abort.signal.aborted || this.state !== 'starting') {
        throw new Error('runner start was cancelled');
      }

      this.runner = processHandle;
      this.startAbort = undefined;
      this.state = 'running';
      this.logger.info('GitHub Actions runner started for MicroVM %s', context.microvmId);
      void this.monitorRunner(processHandle);
    } catch (error) {
      if (processHandle !== undefined) {
        await processHandle.stop();
      }
      if (this.state === 'stopping') {
        this.state = 'stopped';
      } else {
        this.state = 'idle';
        this.microvmId = undefined;
      }
      this.startAbort = undefined;
      throw error;
    } finally {
      // JavaScript strings cannot be zeroized, but release the retained credential promptly.
      if (bootstrap !== undefined) {
        bootstrap.jitConfig = '';
      }
    }
  }

  private async monitorRunner(processHandle: ManagedProcess): Promise<void> {
    const exitCode = await processHandle.exit;
    this.logger.info('GitHub Actions runner exited with status %s', exitCode ?? 'signal');
    if (this.runner === processHandle) {
      this.runner = undefined;
      this.state = 'stopped';
    }
  }

  public async stop(): Promise<void> {
    if (this.state === 'idle') {
      this.state = 'stopped';
    } else if (this.state === 'starting' || this.state === 'running') {
      this.state = 'stopping';
    }
    this.startAbort?.abort();
    const starting = this.startPromise;
    if (starting !== undefined) {
      try {
        await starting;
      } catch {
        // Cancellation is expected when terminate races with /run.
      }
    }
    const running = this.runner;
    this.runner = undefined;
    await (running?.stop() ?? Promise.resolve());
    this.state = 'stopped';
  }

  public async resume(): Promise<boolean> {
    // Never re-consume a one-time runner configuration on resume.
    return true;
  }
}

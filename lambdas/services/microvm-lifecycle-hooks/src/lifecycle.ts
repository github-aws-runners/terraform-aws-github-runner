import type { JitConfigSource, Logger, ManagedProcess, RunnerBootstrap, RunnerLauncher } from './contracts';
import { consoleLogger } from './contracts';
import { parseRunRequest } from './payload';
import { beforeDeadline, beforeDeadlineOrAbort } from './timing';

type LifecycleState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped';

const SAFE_ERROR_NAMES = new Set([
  'AccessDeniedException',
  'AbortError',
  'ExpiredTokenException',
  'InternalServerError',
  'InvalidKeyId',
  'KMSInvalidStateException',
  'ParameterNotFound',
  'ResourceNotFoundException',
  'TimeoutError',
  'ThrottlingException',
]);

const SAFE_ERROR_CODES = new Set(['EACCES', 'EINVAL', 'ENOENT', 'EPERM', 'ETIMEDOUT']);

const SAFE_ERROR_MESSAGES = new Set([
  'operation was cancelled',
  'run-hook deadline elapsed',
  'GitHub Actions runner exited before the launch handoff',
  'runner launch was cancelled',
  'runner start was cancelled',
]);

interface DiagnosticError extends Error {
  code?: unknown;
  $metadata?: unknown;
}

function safeErrorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { errorType: typeof error };
  }

  const diagnosticError = error as DiagnosticError;
  const details: Record<string, unknown> = {
    errorName: SAFE_ERROR_NAMES.has(error.name) ? error.name : 'unknown-error',
  };
  if (SAFE_ERROR_CODES.has(diagnosticError.code as string)) {
    details.errorCode = diagnosticError.code;
  }
  if (SAFE_ERROR_MESSAGES.has(error.message)) {
    details.errorMessage = error.message;
  }

  if (diagnosticError.$metadata !== null && typeof diagnosticError.$metadata === 'object') {
    const metadata = diagnosticError.$metadata as Record<string, unknown>;
    if (typeof metadata.httpStatusCode === 'number' && Number.isInteger(metadata.httpStatusCode)) {
      details.httpStatusCode = metadata.httpStatusCode;
    }
    if (typeof metadata.attempts === 'number' && Number.isInteger(metadata.attempts)) {
      details.awsAttempts = metadata.attempts;
    }
    if (typeof metadata.totalRetryDelay === 'number' && Number.isInteger(metadata.totalRetryDelay)) {
      details.awsRetryDelayMs = metadata.totalRetryDelay;
    }
  }

  return details;
}

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
  private resolveCompletion!: (exitCode: number | null) => void;
  public readonly completion = new Promise<number | null>((resolve) => {
    this.resolveCompletion = resolve;
  });

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
    let stage = 'consume runner configuration';
    try {
      this.logger.info('Lifecycle hook consuming runner configuration for MicroVM %s', context.microvmId);
      bootstrap = await this.jitConfigSource.consume(context, {
        deadlineMs: deadlineMs - this.launchReserveMs,
        signal: abort.signal,
      });
      if (abort.signal.aborted) {
        throw new Error('runner start was cancelled');
      }

      stage = 'launch GitHub Actions runner';
      this.logger.info('Lifecycle hook launching GitHub Actions runner for MicroVM %s', context.microvmId);
      processHandle = this.launcher.launch(bootstrap, context.microvmId);

      stage = 'wait for runner launch handoff';
      this.logger.info('Lifecycle hook waiting for runner launch handoff for MicroVM %s', context.microvmId);
      await beforeDeadlineOrAbort(processHandle.ready, deadlineMs, abort.signal);
      if (abort.signal.aborted || this.state !== 'starting') {
        throw new Error('runner start was cancelled');
      }

      this.runner = processHandle;
      this.startAbort = undefined;
      this.state = 'running';
      this.logger.info('GitHub Actions runner launch handed off for MicroVM %s', context.microvmId);
      void this.monitorRunner(processHandle);
    } catch (error) {
      this.logger.error('Lifecycle hook runner startup failed', {
        microvmId: context.microvmId,
        stage,
        ...safeErrorDetails(error),
      });
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
    if (this.runner === processHandle) {
      this.runner = undefined;
      this.state = 'stopped';
      this.resolveCompletion(exitCode);
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

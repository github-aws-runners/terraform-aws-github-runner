import { type ChildProcess, spawn } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import { arch, type } from 'node:os';
import { isAbsolute, join } from 'node:path';

import type { Logger, ManagedProcess, RunContext, RunnerBootstrap, RunnerLauncher } from './contracts';
import { delay } from './timing';

function safeErrorName(error: unknown): string {
  return error instanceof Error && error.name ? error.name : 'UnknownError';
}

/** Writes the runner-visible machine information consumed during job setup. */
export async function writeRunnerSetupInfo(context: RunContext, logger: Logger): Promise<void> {
  const runnerRoot = process.env.ACTIONS_RUNNER_ROOT ?? '/opt/actions-runner';
  const setupInfoPath = join(runnerRoot, '.setup_info');
  const setupInfo = [
    {
      group: 'Operating System',
      detail: `Platform: ${type()}\nArchitecture: ${arch()}`,
    },
  ];
  if (context.imageArn !== undefined && context.imageVersion !== undefined) {
    setupInfo.push({
      group: 'Runner Image',
      detail: `MicroVM image ARN: ${context.imageArn}\nMicroVM image version: ${context.imageVersion}`,
    });
  }
  setupInfo.push({
    group: 'Lambda MicroVM',
    detail: `MicroVM id: ${context.microvmId}`,
  });

  try {
    await writeFile(setupInfoPath, `${JSON.stringify(setupInfo, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o644,
    });
    await chmod(setupInfoPath, 0o644);
  } catch (error) {
    // Setup information is informational and must not strand consumed JIT.
    logger.warn('GitHub Actions runner setup information could not be written (%s)', safeErrorName(error));
  }
}

const LAUNCH_HANDOFF_DELAY_MS = 1_000;
const MAX_POSIX_ID = 2_147_483_647;
const ENVIRONMENT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const ALWAYS_DENIED_RUNNER_ENVIRONMENT = new Set([
  'ACTIONS_RUNNER_INPUT_JITCONFIG',
  'AWS_ACCESS_KEY_ID',
  'AWS_CONFIG_FILE',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'AWS_CREDENTIAL_EXPIRATION',
  'AWS_DEFAULT_PROFILE',
  'AWS_PROFILE',
  'AWS_ROLE_ARN',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SECURITY_TOKEN',
  'AWS_SESSION_TOKEN',
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'ENCODED_JIT_CONFIG',
  'JIT_CONFIG',
  'MICROVM_RUNNER_ENV_DENYLIST',
  'RUNNER_ALLOW_RUNASROOT',
  'RUNNER_CONFIG_SSM_ARN',
  'RUNNER_CONFIG_SSM_PATH',
  'RUNNER_CONFIG_STORAGE_PROVIDER',
  'RUNNER_TOKEN_SSM_PATH',
  'SSM_TOKEN_PATH',
  'bootstrap_payload',
  'encoded_jit_config',
  'jit_config',
]);

function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      child.kill(signal);
    }
  }
}

function parsePosixId(variable: string, fallback: number): number {
  const value = process.env[variable] ?? String(fallback);
  if (!/^\d+$/.test(value)) {
    throw new Error(`${variable} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > MAX_POSIX_ID) {
    throw new Error(`${variable} must be a positive integer`);
  }
  return parsed;
}

function runnerIdentity(): { gid?: number; uid?: number } {
  if (process.getuid?.() !== 0) {
    return {};
  }
  return {
    gid: parsePosixId('RUNNER_GID', 1_000),
    uid: parsePosixId('RUNNER_UID', 1_000),
  };
}

function runnerEnvironmentDenylist(): Set<string> {
  const configured = process.env.MICROVM_RUNNER_ENV_DENYLIST;
  if (configured === undefined || configured.trim() === '') {
    return new Set(ALWAYS_DENIED_RUNNER_ENVIRONMENT);
  }

  const denylist = new Set(ALWAYS_DENIED_RUNNER_ENVIRONMENT);
  for (const name of configured.split(',')) {
    const normalized = name.trim();
    if (!ENVIRONMENT_NAME_PATTERN.test(normalized)) {
      throw new Error('MICROVM_RUNNER_ENV_DENYLIST contains an invalid environment name');
    }
    denylist.add(normalized);
  }
  return denylist;
}

function runnerEnvironment(microvmId: string, denylist: ReadonlySet<string>): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of denylist) {
    delete environment[name];
  }
  return {
    ...environment,
    HOME: process.env.RUNNER_HOME ?? '/home/runner',
    LOGNAME: process.env.RUNNER_USER ?? 'runner',
    MICROVM_ID: microvmId,
    USER: process.env.RUNNER_USER ?? 'runner',
  };
}

function redactSpawnArguments(child: ChildProcess, arguments_: string[], sensitiveValue: string): void {
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === sensitiveValue) {
      arguments_[index] = '[redacted]';
    }
  }
  for (let index = 0; index < child.spawnargs.length; index += 1) {
    if (child.spawnargs[index] === sensitiveValue) {
      child.spawnargs[index] = '[redacted]';
    }
  }
}

function waitForLaunchHandoff(child: ChildProcess, handoffDelayMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let handoffTimer: NodeJS.Timeout | undefined;

    const cleanup = (): void => {
      child.off('error', onError);
      child.off('spawn', onSpawn);
      child.off('exit', onExit);
      if (handoffTimer !== undefined) {
        clearTimeout(handoffTimer);
      }
    };

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };

    const commit = (): void => {
      if (settled) {
        return;
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        fail(new Error('GitHub Actions runner exited before the launch handoff'));
        return;
      }
      settled = true;
      cleanup();
      child.unref();
      resolve();
    };

    const onError = (error: Error): void => fail(error);
    const onExit = (): void => fail(new Error('GitHub Actions runner exited before the launch handoff'));
    const onSpawn = (): void => {
      handoffTimer = setTimeout(commit, handoffDelayMs);
    };

    child.once('error', onError);
    child.once('spawn', onSpawn);
    child.once('exit', onExit);
  });
}

export class NodeManagedProcess implements ManagedProcess {
  public readonly ready: Promise<void>;
  public readonly exit: Promise<number | null>;

  public constructor(
    private readonly child: ChildProcess,
    readiness: Promise<void>,
    private readonly defaultStopGraceMs: number,
  ) {
    this.ready = readiness;
    this.exit = new Promise((resolve) => {
      child.once('exit', (code) => resolve(code));
      child.once('error', () => resolve(null));
    });
  }

  public get exited(): boolean {
    return this.child.exitCode !== null || this.child.signalCode !== null;
  }

  public async stop(graceMs = this.defaultStopGraceMs): Promise<void> {
    if (this.exited) {
      return;
    }
    signalProcessGroup(this.child, 'SIGTERM');
    const exitedGracefully = await Promise.race([this.exit.then(() => true), delay(graceMs).then(() => false)]);
    if (!exitedGracefully && !this.exited) {
      signalProcessGroup(this.child, 'SIGKILL');
      await Promise.race([this.exit, delay(5_000)]);
    }
  }
}

/** Launches the GitHub Actions runner directly from the image's runner installation. */
export class GitHubRunnerLauncher implements RunnerLauncher {
  private readonly denylist = runnerEnvironmentDenylist();
  private readonly runnerRoot = process.env.RUNNER_ROOT ?? '/opt/actions-runner';
  private readonly identity = runnerIdentity();

  public constructor(
    private readonly stopGraceMs = 30_000,
    private readonly handoffDelayMs = LAUNCH_HANDOFF_DELAY_MS,
  ) {
    if (!isAbsolute(this.runnerRoot)) {
      throw new Error('RUNNER_ROOT must be an absolute path');
    }
  }

  public launch(bootstrap: RunnerBootstrap, microvmId: string): ManagedProcess {
    const runner = join(this.runnerRoot, 'run.sh');
    const arguments_ = ['--jitconfig', bootstrap.jitConfig];
    const child = spawn(runner, arguments_, {
      cwd: this.runnerRoot,
      detached: true,
      env: runnerEnvironment(microvmId, this.denylist),
      shell: false,
      stdio: ['ignore', 'inherit', 'inherit'],
      ...this.identity,
    });
    redactSpawnArguments(child, arguments_, bootstrap.jitConfig);

    const ready = waitForLaunchHandoff(child, this.handoffDelayMs);
    return new NodeManagedProcess(child, ready, this.stopGraceMs);
  }
}

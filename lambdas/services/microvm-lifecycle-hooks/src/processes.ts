import { type ChildProcess, spawn } from 'node:child_process';
import { Readable } from 'node:stream';

import type { ManagedProcess, RunnerBootstrap, RunnerLauncher } from './contracts';
import { delay } from './timing';

const CREDENTIAL_ENVIRONMENT_VARIABLES = [
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
  'AWS_SHARED_CREDENTIALS_FILE',
  'AWS_SESSION_TOKEN',
  'AWS_WEB_IDENTITY_TOKEN_FILE',
  'ENCODED_JIT_CONFIG',
  'RUNNER_CONFIG_STORAGE_PROVIDER',
  'RUNNER_ALLOW_RUNASROOT',
  'SSM_TOKEN_PATH',
] as const;

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

function entrypointEnvironment(microvmId: string): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const variable of CREDENTIAL_ENVIRONMENT_VARIABLES) {
    delete environment[variable];
  }
  return {
    ...environment,
    MICROVM_ID: microvmId,
  };
}

function waitForEntrypointReady(child: ChildProcess): Promise<void> {
  const candidate = child.stdio[3];
  if (!(candidate instanceof Readable)) {
    return Promise.reject(new Error('runner entrypoint readiness pipe is unavailable'));
  }
  const readinessStream: Readable = candidate;
  readinessStream.setEncoding('utf8');

  return new Promise((resolve, reject) => {
    let buffer = '';
    let settled = false;

    function cleanup(): void {
      readinessStream.off('data', onData);
      readinessStream.off('end', onEnd);
      readinessStream.off('error', onError);
      child.off('error', onError);
    }

    function succeed(): void {
      if (!settled) {
        settled = true;
        cleanup();
        resolve();
      }
    }

    function fail(error: Error): void {
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
    }

    function onData(chunk: string | Buffer): void {
      buffer += chunk.toString();
      if (buffer === 'ready\n') {
        succeed();
      } else if (buffer.includes('\n') || buffer.length > 64) {
        fail(new Error('runner entrypoint emitted an invalid readiness signal'));
      }
    }

    function onEnd(): void {
      fail(new Error('runner entrypoint exited before signaling readiness'));
    }

    function onError(error: Error): void {
      fail(error);
    }

    readinessStream.on('data', onData);
    readinessStream.once('end', onEnd);
    readinessStream.once('error', onError);
    child.once('error', onError);
  });
}

/**
 * Sends the one-time JIT document through stdin to an image-specific supervisor.
 * Neither the JIT document nor storage-provider credentials are exported to the runner.
 */
export class RunnerEntrypointLauncher implements RunnerLauncher {
  private readonly entrypoint = process.env.RUNNER_ENTRYPOINT ?? '/opt/microvm/entrypoint.sh';

  public constructor(private readonly stopGraceMs = 30_000) {}

  public launch(bootstrap: RunnerBootstrap, microvmId: string): ManagedProcess {
    const child = spawn(this.entrypoint, ['run'], {
      detached: true,
      env: entrypointEnvironment(microvmId),
      stdio: ['pipe', 'inherit', 'inherit', 'pipe'],
    });
    const entrypointReady = waitForEntrypointReady(child);
    const inputWritten = new Promise<void>((resolve, reject) => {
      const fail = (error: Error): void => reject(error);
      child.once('error', fail);
      child.once('spawn', () => {
        if (child.stdin === null) {
          reject(new Error('runner entrypoint stdin is unavailable'));
          return;
        }
        child.stdin.once('error', fail);
        child.stdin.end(
          JSON.stringify({
            jitConfig: bootstrap.jitConfig,
            microvmId,
            version: 1,
          }),
          () => {
            child.removeListener('error', fail);
            child.stdin?.removeListener('error', fail);
            resolve();
          },
        );
      });
    });
    const ready = Promise.all([inputWritten, entrypointReady]).then(() => undefined);
    return new NodeManagedProcess(child, ready, this.stopGraceMs);
  }
}

import type { RunnerConfigStorageContext } from '@aws-github-runner/storage-providers/runner-config-consumer';

export interface RunContext {
  microvmId: string;
  storage: RunnerConfigStorageContext;
}

export interface ConsumeOptions {
  deadlineMs: number;
  signal: AbortSignal;
}

export interface RunnerBootstrap {
  jitConfig: string;
}

/** Resolves and consumes a one-time runner configuration without exposing provider details. */
export interface JitConfigSource {
  consume(context: RunContext, options: ConsumeOptions): Promise<RunnerBootstrap>;
}

export interface ManagedProcess {
  readonly ready: Promise<void>;
  readonly exit: Promise<number | null>;
  readonly exited: boolean;
  stop(graceMs?: number): Promise<void>;
}

export interface RunnerLauncher {
  launch(bootstrap: RunnerBootstrap, microvmId: string): ManagedProcess;
}

export interface Logger {
  info(message: string, ...values: unknown[]): void;
  warn(message: string, ...values: unknown[]): void;
  error(message: string, ...values: unknown[]): void;
}

export const consoleLogger: Logger = console;

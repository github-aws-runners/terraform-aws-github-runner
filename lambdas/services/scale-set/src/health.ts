export type ScaleSetReconcilerState = 'starting' | 'ready' | 'reconnecting' | 'failed' | 'stopping';
export type ScaleSetControllerState = 'starting' | 'ready' | 'degraded' | 'failed' | 'stopping';

export interface ScaleSetReconcilerHealthSnapshot {
  state: ScaleSetReconcilerState;
  live: boolean;
  ready: boolean;
  lastActivityAt: string;
  consecutiveFailures: number;
  lastErrorName?: string;
}

export interface ScaleSetControllerHealthSnapshot {
  groupName: string;
  state: ScaleSetControllerState;
  live: boolean;
  ready: boolean;
  reconcilers: Readonly<Record<string, ScaleSetReconcilerHealthSnapshot>>;
}

export interface ScaleSetReconcilerStatusReporter {
  markSessionReady(): void;
  markProgress(): void;
  markReconnecting(error?: unknown): void;
  markFailed(error?: unknown): void;
  markStopping(): void;
}

interface MutableHealth {
  state: ScaleSetReconcilerState;
  lastActivityAt: number;
  consecutiveFailures: number;
  lastErrorName?: string;
}

function errorName(error: unknown): string | undefined {
  if (error === undefined) return undefined;
  return error instanceof Error ? error.name : typeof error;
}

export class ScaleSetControllerHealth {
  private readonly states = new Map<string, MutableHealth>();
  private stopping = false;

  constructor(
    readonly groupName: string,
    runnerConfigNames: readonly string[],
    private readonly staleAfterMs: number,
    private readonly now: () => number = Date.now,
  ) {
    const startedAt = now();
    for (const name of runnerConfigNames) {
      if (this.states.has(name)) throw new Error(`duplicate health reporter for ${JSON.stringify(name)}`);
      this.states.set(name, { state: 'starting', lastActivityAt: startedAt, consecutiveFailures: 0 });
    }
    if (this.states.size === 0) throw new Error('at least one reconciler health reporter is required');
  }

  reporter(runnerConfigName: string): ScaleSetReconcilerStatusReporter {
    const state = this.states.get(runnerConfigName);
    if (!state) throw new Error(`unknown runner config ${JSON.stringify(runnerConfigName)}`);
    return {
      markSessionReady: () => {
        if (state.state === 'starting') {
          state.state = 'ready';
          state.lastActivityAt = this.now();
        } else if (state.state === 'reconnecting') {
          state.state = 'ready';
        }
      },
      markProgress: () => {
        if (state.state === 'failed' || state.state === 'stopping') return;
        state.state = 'ready';
        state.lastActivityAt = this.now();
        state.consecutiveFailures = 0;
        state.lastErrorName = undefined;
      },
      markReconnecting: (error) => {
        if (state.state === 'failed' || state.state === 'stopping') return;
        state.state = 'reconnecting';
        state.lastActivityAt = this.now();
        state.consecutiveFailures += 1;
        state.lastErrorName = errorName(error);
      },
      markFailed: (error) => {
        if (state.state === 'stopping') return;
        state.state = 'failed';
        state.consecutiveFailures += 1;
        state.lastErrorName = errorName(error);
      },
      markStopping: () => {
        if (state.state !== 'failed') state.state = 'stopping';
      },
    };
  }

  markStopping(): void {
    this.stopping = true;
    for (const name of this.states.keys()) this.reporter(name).markStopping();
  }

  snapshot(): ScaleSetControllerHealthSnapshot {
    const now = this.now();
    const reconcilers: Record<string, ScaleSetReconcilerHealthSnapshot> = Object.create(null) as Record<
      string,
      ScaleSetReconcilerHealthSnapshot
    >;
    for (const [name, state] of this.states) {
      const stale = now - state.lastActivityAt > this.staleAfterMs;
      // Staleness means the reconciler is not ready, but it is not a process
      // liveness failure. A single bounded GitHub/AWS request can legitimately
      // outlive the readiness window; restarting the task would only churn its
      // message sessions and reset the provider retry policy.
      const live = state.state === 'stopping' || state.state !== 'failed';
      reconcilers[name] = {
        state: state.state,
        live,
        ready: state.state === 'ready' && !stale,
        lastActivityAt: new Date(state.lastActivityAt).toISOString(),
        consecutiveFailures: state.consecutiveFailures,
        ...(state.lastErrorName === undefined ? {} : { lastErrorName: state.lastErrorName }),
      };
    }
    const values = Object.values(reconcilers);
    const liveCount = values.filter(({ live }) => live).length;
    const readyCount = values.filter(({ ready }) => ready).length;
    const live = this.stopping || liveCount > 0;
    const ready = !this.stopping && readyCount === values.length;
    let state: ScaleSetControllerState;
    if (this.stopping) state = 'stopping';
    else if (ready) state = 'ready';
    else if (liveCount === 0) state = 'failed';
    else if (values.every((value) => value.state === 'starting')) state = 'starting';
    else state = 'degraded';
    return { groupName: this.groupName, state, live, ready, reconcilers };
  }
}

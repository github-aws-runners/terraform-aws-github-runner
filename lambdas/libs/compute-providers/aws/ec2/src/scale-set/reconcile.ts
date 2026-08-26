import type {
  ScaleSetReconcileActions,
  ScaleSetReconcileError,
  ScaleSetReconcileOperation,
  ScaleSetReconcileResult,
} from '../../../../scale-set';

const MAX_BOOT_TIMEOUT_MINUTES = 120;

export interface MutableReconcileState {
  currentRunners: number;
  needsRunnerInventory: boolean;
  retainedUnknownResourceIds: Set<string>;
  actions: ScaleSetReconcileActions;
  errors: ScaleSetReconcileError[];
}

export class NonRetryableScaleSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableScaleSetError';
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function safeError(
  operation: ScaleSetReconcileOperation,
  error: unknown,
  details: Pick<ScaleSetReconcileError, 'runnerName' | 'resourceId'> = {},
): ScaleSetReconcileError {
  return {
    operation,
    code: safeErrorCode(error),
    retryable: isRetryableError(error),
    ...details,
  };
}

function safeErrorCode(error: unknown): string {
  if (error instanceof NonRetryableScaleSetError) return 'INVALID_CONFIGURATION';
  if (!isRecord(error)) return 'UNEXPECTED_ERROR';
  for (const candidate of [error.name, error.code]) {
    if (typeof candidate === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(candidate)) {
      return candidate;
    }
  }
  return 'UNEXPECTED_ERROR';
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof NonRetryableScaleSetError) return false;
  if (!isRecord(error)) return true;

  const identity = [error.name, error.code]
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .join(' ')
    .toLowerCase();
  if (/accessdenied|unauthor|forbidden|permission|validation|invalid|malformed|unsupported/.test(identity)) {
    return false;
  }
  if (/throttl|timeout|temporar|serviceunavailable|internalserver|network|econn|socket|slowdown/.test(identity)) {
    return true;
  }

  const metadata = isRecord(error.$metadata) ? error.$metadata : undefined;
  const status = [error.status, error.statusCode, metadata?.httpStatusCode].find(
    (candidate): candidate is number => typeof candidate === 'number',
  );
  if (status !== undefined) {
    return status >= 500 || [408, 409, 425, 429].includes(status);
  }
  return true;
}

export function throwIfAborted(signal: AbortSignal, error?: unknown): void {
  if (signal.aborted || (isRecord(error) && error.name === 'AbortError')) {
    signal.throwIfAborted();
    throw error;
  }
}

function resultStatus(
  errors: readonly ScaleSetReconcileError[],
  current: number,
  desired: number,
  needsRunnerInventory: boolean,
) {
  if (errors.some((error) => !error.retryable)) return 'non_retryable_error' as const;
  if (errors.length > 0 || current < desired) return 'retryable_error' as const;
  if (needsRunnerInventory) return 'retained' as const;
  if (current > desired) return 'retained' as const;
  return 'converged' as const;
}

export function finish(state: MutableReconcileState, desiredRunners: number): ScaleSetReconcileResult {
  if (desiredRunners >= 0 && state.currentRunners < desiredRunners && state.errors.length === 0) {
    state.errors.push({
      operation: 'reconcile',
      code: 'CAPACITY_NOT_PROVISIONED',
      retryable: true,
    });
  }
  return {
    status: resultStatus(state.errors, state.currentRunners, desiredRunners, state.needsRunnerInventory),
    desiredRunners,
    currentRunners: state.currentRunners,
    needsRunnerInventory: state.needsRunnerInventory,
    actions: state.actions,
    errors: state.errors,
  };
}

export function emptyState(currentRunners: number): MutableReconcileState {
  return {
    currentRunners,
    needsRunnerInventory: false,
    retainedUnknownResourceIds: new Set(),
    actions: { launched: 0, terminated: 0, retainedBusy: 0, retainedUnknown: 0 },
    errors: [],
  };
}

export function retainUnknown(state: MutableReconcileState, resourceId?: string): void {
  if (resourceId === undefined) {
    state.actions.retainedUnknown++;
    return;
  }
  if (state.retainedUnknownResourceIds.has(resourceId)) return;
  state.retainedUnknownResourceIds.add(resourceId);
  state.actions.retainedUnknown++;
}

export function validateDesiredRunners(desiredRunners: number): ScaleSetReconcileError | undefined {
  if (!Number.isSafeInteger(desiredRunners) || desiredRunners < 0 || desiredRunners > 10000) {
    return {
      operation: 'validate',
      code: 'INVALID_DESIRED_RUNNER_COUNT',
      retryable: false,
    };
  }
  return undefined;
}

export function validateBootTimeout(bootTimeoutMinutes: number): ScaleSetReconcileError | undefined {
  if (
    !Number.isSafeInteger(bootTimeoutMinutes) ||
    bootTimeoutMinutes < 1 ||
    bootTimeoutMinutes > MAX_BOOT_TIMEOUT_MINUTES
  ) {
    return {
      operation: 'validate',
      code: 'INVALID_BOOT_TIMEOUT',
      retryable: false,
    };
  }
  return undefined;
}

export function validateInventorySignal(runnerInventoryComplete: unknown): ScaleSetReconcileError | undefined {
  if (typeof runnerInventoryComplete !== 'boolean') {
    return {
      operation: 'validate',
      code: 'INVALID_RUNNER_INVENTORY_SIGNAL',
      retryable: false,
    };
  }
  return undefined;
}

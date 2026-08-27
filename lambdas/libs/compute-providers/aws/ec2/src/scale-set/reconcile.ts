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

export class Ec2ScaleSetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Ec2ScaleSetValidationError';
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
    ...details,
  };
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Ec2ScaleSetValidationError) return 'INVALID_CONFIGURATION';
  if (!isRecord(error)) return 'UNEXPECTED_ERROR';
  for (const candidate of [error.name, error.code]) {
    if (typeof candidate === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(candidate)) {
      return candidate;
    }
  }
  return 'UNEXPECTED_ERROR';
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
  if (errors.length > 0 || current < desired) return 'error' as const;
  if (needsRunnerInventory) return 'retained' as const;
  if (current > desired) return 'retained' as const;
  return 'converged' as const;
}

export function finish(state: MutableReconcileState, desiredRunners: number): ScaleSetReconcileResult {
  if (desiredRunners >= 0 && state.currentRunners < desiredRunners && state.errors.length === 0) {
    state.errors.push({
      operation: 'reconcile',
      code: 'CAPACITY_NOT_PROVISIONED',
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
    };
  }
  return undefined;
}

export function validateInventorySignal(runnerInventoryComplete: unknown): ScaleSetReconcileError | undefined {
  if (typeof runnerInventoryComplete !== 'boolean') {
    return {
      operation: 'validate',
      code: 'INVALID_RUNNER_INVENTORY_SIGNAL',
    };
  }
  return undefined;
}

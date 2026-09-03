export function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => signal?.removeEventListener('abort', cancel);
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const cancel = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error('operation was cancelled'));
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) {
      cancel();
    }
  });
}

export async function beforeDeadline<T>(promise: Promise<T>, deadlineMs: number): Promise<T> {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) {
    throw new Error('run-hook deadline elapsed');
  }
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('run-hook deadline elapsed')), remaining);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export async function beforeDeadlineOrAbort<T>(
  promise: Promise<T>,
  deadlineMs: number,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw new Error('runner start was cancelled');
  }
  let cancel = (): void => undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    cancel = (): void => reject(new Error('runner start was cancelled'));
    signal.addEventListener('abort', cancel, { once: true });
  });
  try {
    return await beforeDeadline(Promise.race([promise, cancelled]), deadlineMs);
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}

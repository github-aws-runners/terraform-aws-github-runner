import { ScaleSetServiceRuntime } from './lifecycle';

describe('ScaleSetServiceRuntime', () => {
  it('starts once and performs idempotent bounded shutdown', async () => {
    const health = { markStopping: vi.fn(), snapshot: vi.fn() };
    const run = vi.fn(async (signal: AbortSignal) => {
      if (!signal.aborted)
        await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
    });
    const runtime = new ScaleSetServiceRuntime({ shutdownTimeoutMs: 100 }, { run, health } as never);
    const completion = runtime.run();
    expect(() => runtime.run()).toThrow('already started');
    const shutdown = runtime.shutdown();
    expect(runtime.shutdown()).toBe(shutdown);
    await shutdown;
    await completion;
    expect(health.markStopping).toHaveBeenCalledOnce();
  });

  it('allows shutdown before start and prevents a later start', async () => {
    const health = { markStopping: vi.fn() };
    const runtime = new ScaleSetServiceRuntime({ shutdownTimeoutMs: 100 }, { run: vi.fn(), health } as never);
    await runtime.shutdown();
    expect(() => runtime.run()).toThrow('already stopping');
  });

  it('rejects when a controller ignores cancellation past the timeout', async () => {
    vi.useFakeTimers();
    try {
      const health = { markStopping: vi.fn() };
      const runtime = new ScaleSetServiceRuntime({ shutdownTimeoutMs: 10 }, {
        run: vi.fn(() => new Promise<void>(() => undefined)),
        health,
      } as never);
      void runtime.run();
      await Promise.resolve();
      const shutdown = runtime.shutdown();
      const expectation = expect(shutdown).rejects.toThrow('did not stop within 10ms');
      await vi.advanceTimersByTimeAsync(10);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});

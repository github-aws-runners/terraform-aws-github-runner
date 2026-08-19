import type { AddressInfo } from 'node:net';

import type { Logger } from './contracts';
import { createHookServer, type HookLifecycle, HOOK_PREFIX, parsePositiveInteger, shutdownHookServer } from './server';

const quietLogger: Logger = {
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

const idleLifecycle: HookLifecycle = {
  resume: async () => true,
  start: async () => true,
  stop: async () => undefined,
};

async function listen(server: ReturnType<typeof createHookServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: ReturnType<typeof createHookServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
    server.closeAllConnections();
  });
}

describe('hook server', () => {
  it('rejects invalid and out-of-range positive integer values', () => {
    expect(parsePositiveInteger(undefined, 8080, 65_535)).toBe(8080);
    expect(parsePositiveInteger('', 8080, 65_535)).toBe(8080);
    expect(parsePositiveInteger('0', 8080, 65_535)).toBe(8080);
    expect(parsePositiveInteger('-1', 8080, 65_535)).toBe(8080);
    expect(parsePositiveInteger('1.5', 8080, 65_535)).toBe(8080);
    expect(parsePositiveInteger('8080http', 8080, 65_535)).toBe(8080);
    expect(parsePositiveInteger('65536', 8080, 65_535)).toBe(8080);
    expect(parsePositiveInteger('9007199254740992', 8080)).toBe(8080);
    expect(parsePositiveInteger('9090', 8080, 65_535)).toBe(9090);
  });

  it('configures bounded request, header, connection, and socket limits', () => {
    const server = createHookServer(idleLifecycle, quietLogger, {
      headersTimeoutMs: 2_000,
      keepAliveTimeoutMs: 3_000,
      requestTimeoutMs: 4_000,
    });

    expect(server.headersTimeout).toBe(2_000);
    expect(server.keepAliveTimeout).toBe(3_000);
    expect(server.requestTimeout).toBe(4_000);
    expect(server.maxConnections).toBe(128);
    expect(server.maxHeadersCount).toBe(64);
    expect(server.maxRequestsPerSocket).toBe(100);
  });

  it('acknowledges build hooks without starting a runner', async () => {
    const lifecycle: HookLifecycle = {
      resume: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
    const server = createHookServer(lifecycle, quietLogger);
    const baseUrl = await listen(server);
    try {
      const ready = await fetch(`${baseUrl}${HOOK_PREFIX}/ready`, { method: 'POST' });
      const validate = await fetch(`${baseUrl}${HOOK_PREFIX}/validate`, { method: 'POST' });

      expect(ready.status).toBe(200);
      await expect(ready.json()).resolves.toEqual({ status: 'ready' });
      expect(validate.status).toBe(200);
      await expect(validate.json()).resolves.toEqual({ status: 'validated' });
      expect(lifecycle.start).not.toHaveBeenCalled();
      expect(lifecycle.stop).not.toHaveBeenCalled();
    } finally {
      await close(server);
    }
  });

  it('rejects oversized request bodies before invoking the lifecycle', async () => {
    const lifecycle: HookLifecycle = {
      ...idleLifecycle,
      start: vi.fn(),
    };
    const server = createHookServer(lifecycle, quietLogger);
    const baseUrl = await listen(server);
    try {
      const response = await fetch(`${baseUrl}${HOOK_PREFIX}/run`, {
        body: 'x'.repeat(20 * 1024 + 1),
        method: 'POST',
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'request body is too large' });
      expect(lifecycle.start).not.toHaveBeenCalled();
    } finally {
      await close(server);
    }
  });

  it('does not reflect or log secret-bearing internal errors', async () => {
    const messages: unknown[] = [];
    const logger: Logger = {
      error: (...values) => messages.push(...values),
      info: () => undefined,
      warn: () => undefined,
    };
    const lifecycle: HookLifecycle = {
      ...idleLifecycle,
      start: async () => {
        const error = new Error('encoded-jit-secret');
        error.name = 'encoded-jit-secret';
        throw error;
      },
    };
    const server = createHookServer(lifecycle, logger);
    const baseUrl = await listen(server);
    try {
      const response = await fetch(`${baseUrl}${HOOK_PREFIX}/run`, {
        body: '{}',
        method: 'POST',
      });

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ error: 'lifecycle hook failed' });
      expect(JSON.stringify(messages)).not.toContain('encoded-jit-secret');
    } finally {
      await close(server);
    }
  });

  it('waits for lifecycle cleanup before closing active connections', async () => {
    const events: string[] = [];
    let finishCleanup = (): void => undefined;
    const cleanup = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    const server = {
      close: () => events.push('stop-accepting'),
      closeAllConnections: () => events.push('close-connections'),
    };
    const lifecycle = {
      async stop(): Promise<void> {
        events.push('cleanup-started');
        await cleanup;
        events.push('cleanup-finished');
      },
    };

    const shutdown = shutdownHookServer(server, lifecycle);
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['stop-accepting', 'cleanup-started']);

    finishCleanup();
    await shutdown;
    expect(events).toEqual(['stop-accepting', 'cleanup-started', 'cleanup-finished', 'close-connections']);
  });
});

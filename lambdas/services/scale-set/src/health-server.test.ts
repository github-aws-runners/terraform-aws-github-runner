import { startScaleSetHealthServer } from './health-server';

describe('health server', () => {
  it('separates liveness and readiness on loopback', async () => {
    const health = { snapshot: vi.fn(() => ({ live: true, ready: false, state: 'degraded' })) };
    const server = await startScaleSetHealthServer(health, 0);
    try {
      await expect(fetch(`http://127.0.0.1:${server.port}/healthz`)).resolves.toMatchObject({ status: 200 });
      await expect(fetch(`http://127.0.0.1:${server.port}/readyz`)).resolves.toMatchObject({ status: 503 });
      await expect(fetch(`http://127.0.0.1:${server.port}/other`)).resolves.toMatchObject({ status: 404 });
    } finally {
      await server.close();
    }
  });
});

import { createServer, type Server } from 'node:http';

import type { ScaleSetControllerHealth } from './health';

export interface ScaleSetHealthServer {
  port: number;
  close(): Promise<void>;
}

export async function startScaleSetHealthServer(
  health: Pick<ScaleSetControllerHealth, 'snapshot'>,
  port: number,
): Promise<ScaleSetHealthServer> {
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'close');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (request.method !== 'GET' || (request.url !== '/healthz' && request.url !== '/readyz')) {
      response.statusCode = 404;
      response.end(JSON.stringify({ status: 'not-found' }));
      return;
    }

    const snapshot = health.snapshot();
    const healthy = request.url === '/readyz' ? snapshot.ready : snapshot.live;
    response.statusCode = healthy ? 200 : 503;
    response.end(JSON.stringify(snapshot));
  });
  await listen(server, port);
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('health server did not bind a TCP address');
  return {
    port: address.port,
    close: async () => {
      server.closeAllConnections();
      if (!server.listening) return;
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', onError);
      resolve();
    });
  });
}

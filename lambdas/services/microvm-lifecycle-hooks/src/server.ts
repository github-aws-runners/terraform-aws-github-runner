import http, { type IncomingMessage, type ServerResponse } from 'node:http';

import type { Logger } from './contracts';
import { consoleLogger } from './contracts';
import { RunnerLifecycle } from './lifecycle';
import { HookRequestError, MAX_REQUEST_BYTES } from './payload';
import { RunnerEntrypointLauncher } from './processes';
import { StorageJitConfigSource } from './storage';

export const HOOK_PREFIX = '/aws/lambda-microvms/runtime/v1';

const MAX_TIMER_SECONDS = 2_147_483;

export interface HookLifecycle {
  start(body: string): Promise<boolean>;
  stop(): Promise<void>;
  resume(): Promise<boolean>;
}

export interface HookServerOptions {
  headersTimeoutMs?: number;
  keepAliveTimeoutMs?: number;
  requestTimeoutMs?: number;
}

export function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (value === undefined || !/^\d+$/.test(value)) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

function timeoutMilliseconds(variable: string, fallbackSeconds: number, maximumSeconds = 60): number {
  return (
    parsePositiveInteger(process.env[variable], fallbackSeconds, Math.min(maximumSeconds, MAX_TIMER_SECONDS)) * 1_000
  );
}

function respond(response: ServerResponse, status: number, payload: object): void {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    'Content-Type': 'application/json',
  });
  response.end(body);
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const contentLength = request.headers['content-length'];
    let declaredLength: number | undefined;
    if (contentLength !== undefined) {
      declaredLength = Number(contentLength);
      if (!Number.isInteger(declaredLength) || declaredLength < 0) {
        reject(new HookRequestError('Content-Length is invalid'));
        request.resume();
        return;
      }
      if (declaredLength > MAX_REQUEST_BYTES) {
        reject(new HookRequestError('request body is too large'));
        request.resume();
        return;
      }
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    request.on('data', (chunk: Buffer) => {
      if (settled) {
        return;
      }
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        fail(new HookRequestError('request body is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.once('end', () => {
      if (settled) {
        return;
      }
      if (declaredLength !== undefined && declaredLength !== size) {
        fail(new HookRequestError('Content-Length does not match the request body'));
        return;
      }
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    request.once('aborted', () => fail(new HookRequestError('request body was interrupted')));
    request.once('error', (error) => fail(error));
  });
}

export function createHookServer(
  lifecycle: HookLifecycle,
  logger: Logger = consoleLogger,
  options: HookServerOptions = {},
): http.Server {
  const requestTimeout = options.requestTimeoutMs ?? timeoutMilliseconds('HOOK_REQUEST_TIMEOUT_SECONDS', 10);
  const headersTimeout = Math.min(
    options.headersTimeoutMs ?? timeoutMilliseconds('HOOK_HEADERS_TIMEOUT_SECONDS', 5),
    requestTimeout,
  );
  const keepAliveTimeout = options.keepAliveTimeoutMs ?? timeoutMilliseconds('HOOK_KEEP_ALIVE_TIMEOUT_SECONDS', 5);

  const server = http.createServer(
    {
      headersTimeout,
      keepAliveTimeout,
      maxHeaderSize: 16 * 1024,
      requestTimeout,
    },
    async (request, response) => {
      const path = request.url ?? '';
      if (request.method !== 'POST') {
        request.resume();
        respond(response, 405, { error: 'method not allowed' });
        return;
      }

      try {
        // Consume every POST body so all lifecycle endpoints share the same bounded request handling.
        const body = await readBody(request);
        if (path === `${HOOK_PREFIX}/ready`) {
          respond(response, 200, { status: 'ready' });
          return;
        }
        if (path === `${HOOK_PREFIX}/validate`) {
          respond(response, 200, { status: 'validated' });
          return;
        }
        if (path === `${HOOK_PREFIX}/run`) {
          const started = await lifecycle.start(body);
          respond(response, 200, { status: started ? 'started' : 'already-started' });
          return;
        }
        if (path === `${HOOK_PREFIX}/terminate`) {
          await lifecycle.stop();
          respond(response, 200, { status: 'stopped' });
          return;
        }
        if (path === `${HOOK_PREFIX}/resume`) {
          const ready = await lifecycle.resume();
          respond(response, ready ? 200 : 503, { status: ready ? 'ready' : 'not-ready' });
          return;
        }
        if (path === `${HOOK_PREFIX}/suspend`) {
          respond(response, 200, { status: 'ok' });
          return;
        }
        respond(response, 404, { error: 'unknown lifecycle hook' });
      } catch (error) {
        if (error instanceof HookRequestError) {
          logger.warn('Rejected invalid lifecycle hook request');
          respond(response, 400, { error: error.message });
          return;
        }
        // Parse and provider errors can contain credentials in both message and name.
        logger.error('Lifecycle hook failed');
        respond(response, 500, { error: 'lifecycle hook failed' });
      }
    },
  );
  server.maxConnections = 128;
  server.maxHeadersCount = 64;
  server.maxRequestsPerSocket = 100;
  return server;
}

export function createDefaultLifecycle(logger: Logger = consoleLogger): RunnerLifecycle {
  return new RunnerLifecycle(new StorageJitConfigSource(), new RunnerEntrypointLauncher(), logger);
}

interface ClosableServer {
  close(): unknown;
  closeAllConnections(): void;
}

interface StoppableLifecycle {
  stop(): Promise<void>;
}

export async function shutdownHookServer(server: ClosableServer, lifecycle: StoppableLifecycle): Promise<void> {
  server.close();
  try {
    await lifecycle.stop();
  } finally {
    server.closeAllConnections();
  }
}

function hookExitCode(runnerExitCode: number | null): number {
  return runnerExitCode === 0 ? 0 : 1;
}

export function watchRunnerCompletion(
  lifecycle: Pick<RunnerLifecycle, 'completion'>,
  logger: Logger,
  requestExit: (exitCode: number) => void,
): void {
  void lifecycle.completion.then((runnerExitCode) => {
    const exitCode = hookExitCode(runnerExitCode);
    if (exitCode === 0) {
      logger.info('GitHub Actions runner exited with status %s', runnerExitCode);
    } else {
      logger.error('GitHub Actions runner exited unexpectedly with status %s', runnerExitCode ?? 'signal');
    }
    // Let the /run handler flush its acknowledgement if the runner exits immediately after readiness.
    setImmediate(() => requestExit(exitCode));
  });
}

export function createHookExitRequester(
  server: ClosableServer,
  lifecycle: StoppableLifecycle,
  logger: Logger,
  setExitCode: (exitCode: number) => void = (exitCode) => {
    // Let Node exit naturally after lifecycle cleanup and log streams have drained.
    process.exitCode = exitCode;
  },
): (exitCode: number) => void {
  let exiting = false;
  return (exitCode: number): void => {
    if (exiting) {
      return;
    }
    exiting = true;
    void shutdownHookServer(server, lifecycle).then(
      () => setExitCode(exitCode),
      () => {
        logger.error('Lifecycle hook shutdown failed');
        setExitCode(1);
      },
    );
  };
}

export async function main(): Promise<void> {
  const logger = consoleLogger;
  const lifecycle = createDefaultLifecycle(logger);
  const server = createHookServer(lifecycle, logger);
  const port = parsePositiveInteger(process.env.HOOK_PORT, 8080, 65_535);

  const requestExit = createHookExitRequester(server, lifecycle, logger);
  process.once('SIGINT', () => requestExit(0));
  process.once('SIGTERM', () => requestExit(0));
  watchRunnerCompletion(lifecycle, logger, requestExit);

  await new Promise<void>((resolve, reject) => {
    const onError = (): void => reject(new Error('lifecycle hook server could not listen'));
    server.once('error', onError);
    server.listen(port, '0.0.0.0', () => {
      server.off('error', onError);
      logger.info('Lambda MicroVM lifecycle hooks listening on port %d', port);
      resolve();
    });
  });
}

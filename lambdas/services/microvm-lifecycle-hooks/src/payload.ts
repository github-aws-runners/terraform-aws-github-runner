import {
  parseRunnerConfigStorageContext,
  type RunnerConfigStorageContext,
} from '@aws-github-runner/storage-providers/runner-config-consumer';

import type { RunContext } from './contracts';

const MICROVM_ID_PATTERN = /^[A-Za-z0-9_.-]{1,256}$/;

export const MAX_REQUEST_BYTES = 20 * 1024;

export class HookRequestError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'HookRequestError';
  }
}

interface LambdaRunRequest {
  microvmId?: unknown;
  runHookPayload?: unknown;
}

interface VersionedRunPayload {
  version?: unknown;
  runnerConfigSsmPath?: unknown;
  context?: unknown;
}

interface VersionTwoContext {
  storage?: unknown;
}

function parseObject<T>(value: string, errorMessage: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new HookRequestError(errorMessage);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HookRequestError(errorMessage);
  }
  return parsed as T;
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseStorageContext(value: unknown): RunnerConfigStorageContext {
  try {
    return parseRunnerConfigStorageContext(value);
  } catch {
    // Storage validation details are deliberately not reflected to the hook caller.
    throw new HookRequestError('runner configuration storage context is missing or invalid');
  }
}

export function parseRunRequest(body: string): RunContext {
  const request = parseObject<LambdaRunRequest>(body, 'request body must be a JSON object');
  if (typeof request.microvmId !== 'string' || !MICROVM_ID_PATTERN.test(request.microvmId)) {
    throw new HookRequestError('microvmId is missing or invalid');
  }
  if (typeof request.runHookPayload !== 'string') {
    throw new HookRequestError('runHookPayload must be a JSON string');
  }

  const payload = parseObject<VersionedRunPayload>(request.runHookPayload, 'runHookPayload must contain valid JSON');
  if (payload.version === 1) {
    if (!hasExactKeys(payload, ['version', 'runnerConfigSsmPath'])) {
      throw new HookRequestError('version 1 runHookPayload contains unsupported or missing fields');
    }
    return {
      microvmId: request.microvmId,
      storage: parseStorageContext({
        RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
        SSM_TOKEN_PATH: payload.runnerConfigSsmPath,
      }),
    };
  }
  if (payload.version === 2) {
    if (!hasExactKeys(payload, ['version', 'context'])) {
      throw new HookRequestError('version 2 runHookPayload contains unsupported or missing fields');
    }
    if (!isObject(payload.context) || !hasExactKeys(payload.context, ['storage'])) {
      throw new HookRequestError('version 2 context contains unsupported or missing fields');
    }
    const context = payload.context as VersionTwoContext;
    return {
      microvmId: request.microvmId,
      storage: parseStorageContext(context.storage),
    };
  }
  throw new HookRequestError('runHookPayload version must be 1 or 2');
}

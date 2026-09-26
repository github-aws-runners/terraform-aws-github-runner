import {
  parseRunnerConfigStorageContext,
  type RunnerConfigStorageContext,
} from '@aws-github-runner/storage-providers/runner-config-consumer';

import type { RunContext } from './contracts';

const MICROVM_ID_PATTERN = /^[A-Za-z0-9_.-]{1,256}$/;
const MICROVM_IMAGE_ARN_PATTERN = /^arn:aws[a-z-]*:lambda:[A-Za-z0-9-]+:[0-9]{12}:microvm-image:[A-Za-z0-9_.-]+$/;
const MICROVM_IMAGE_VERSION_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;

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
  imageArn?: unknown;
  imageVersion?: unknown;
  runnerConfigSsmPath?: unknown;
  runnerTokenSsmPath?: unknown;
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

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
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
    if (
      !hasOnlyKeys(payload, ['version', 'imageArn', 'imageVersion', 'runnerConfigSsmPath', 'runnerTokenSsmPath']) ||
      typeof payload.runnerConfigSsmPath !== 'string' ||
      typeof payload.runnerTokenSsmPath !== 'string'
    ) {
      throw new HookRequestError('version 1 runHookPayload contains unsupported or missing fields');
    }
    const hasImageMetadata = payload.imageArn !== undefined || payload.imageVersion !== undefined;
    if (
      hasImageMetadata &&
      (typeof payload.imageArn !== 'string' ||
        payload.imageArn.length > 2_048 ||
        !MICROVM_IMAGE_ARN_PATTERN.test(payload.imageArn) ||
        typeof payload.imageVersion !== 'string' ||
        !MICROVM_IMAGE_VERSION_PATTERN.test(payload.imageVersion))
    ) {
      throw new HookRequestError('imageArn and imageVersion must be valid when provided');
    }
    return {
      ...(hasImageMetadata
        ? {
            imageArn: payload.imageArn as string,
            imageVersion: payload.imageVersion as string,
          }
        : {}),
      microvmId: request.microvmId,
      storage: parseStorageContext({
        RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
        SSM_TOKEN_PATH: payload.runnerTokenSsmPath,
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

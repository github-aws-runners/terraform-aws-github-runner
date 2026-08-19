import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { deleteParameter, getParametersByPath, putParameter } from '@aws-github-runner/aws-ssm-util';
import type { MicrovmState } from '@aws-sdk/client-lambda-microvms';

import type { LambdaRunnerSource, RunnerType } from '../../../../core';

const logger = createChildLogger('microvm-runner-metadata');

const METADATA_VERSION = 1;
const EXPIRATION_GRACE_IN_SECONDS = 300;
const MAX_RECONCILED_RUNNERS = 10;
const MICROVM_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const GITHUB_RUNNER_ID_SUFFIX = '.github-runner-id';
const ORPHAN_SUFFIX = '.orphan';
const CLEANUP_REQUESTED_AT_SUFFIX = '.cleanup-requested-at';
const ACTIVE_STATES = new Set<MicrovmState>(['PENDING', 'RUNNING', 'SUSPENDING', 'SUSPENDED']);

export interface MicrovmRunnerMetadata {
  bypassRemoval?: boolean;
  createdAt: string;
  environment: string;
  expiresAt: string;
  githubRunnerId?: string;
  imageArn: string;
  imageVersion?: string;
  microvmId: string;
  orphan?: boolean;
  runnerOwner: string;
  runnerType: RunnerType;
  source: LambdaRunnerSource;
  version: 1;
}

export interface MicrovmRunnerMetadataInventory {
  cleanupMicrovmIds: string[];
  metadataById: Map<string, MicrovmRunnerMetadata>;
}

export interface CreateMicrovmRunnerMetadataInput {
  environment: string;
  imageArn: string;
  imageVersion?: string;
  maximumDurationInSeconds: number;
  microvmId: string;
  runnerOwner: string;
  runnerType: RunnerType;
  source: LambdaRunnerSource;
}

function normalizedPath(path: string): string {
  return path.trim().replace(/\/+$/, '');
}

export function microvmMetadataParameterName(metadataSsmPath: string, microvmId: string): string {
  if (!MICROVM_ID_PATTERN.test(microvmId)) {
    throw new Error(`Invalid MicroVM identifier '${microvmId}'`);
  }
  return `${normalizedPath(metadataSsmPath)}/${microvmId}`;
}

function stateParameterName(metadataSsmPath: string, microvmId: string, suffix: string): string {
  return `${microvmMetadataParameterName(metadataSsmPath, microvmId)}${suffix}`;
}

function metadataParameterNames(metadataSsmPath: string, microvmId: string): string[] {
  const baseName = microvmMetadataParameterName(metadataSsmPath, microvmId);
  return [
    `${baseName}${GITHUB_RUNNER_ID_SUFFIX}`,
    `${baseName}${ORPHAN_SUFFIX}`,
    `${baseName}${CLEANUP_REQUESTED_AT_SUFFIX}`,
    baseName,
  ];
}

export function assertSeparatedMicrovmMetadataPath(metadataSsmPath: string, runnerConfigSsmPath: string): void {
  const metadataPath = normalizedPath(metadataSsmPath);
  const runnerConfigPath = normalizedPath(runnerConfigSsmPath);
  if (
    metadataPath === runnerConfigPath ||
    metadataPath.startsWith(`${runnerConfigPath}/`) ||
    runnerConfigPath.startsWith(`${metadataPath}/`)
  ) {
    throw new Error('MICROVM_METADATA_SSM_PATH must be separate from the runner JIT configuration path');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === 'string' && value.length > 0);
}

function optionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean';
}

function parseMetadata(value: string, expectedMicrovmId: string): MicrovmRunnerMetadata | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) return undefined;

  const createdAt = typeof parsed.createdAt === 'string' ? Date.parse(parsed.createdAt) : Number.NaN;
  const expiresAt = typeof parsed.expiresAt === 'string' ? Date.parse(parsed.expiresAt) : Number.NaN;
  if (
    parsed.version !== METADATA_VERSION ||
    parsed.microvmId !== expectedMicrovmId ||
    typeof parsed.environment !== 'string' ||
    parsed.environment.length === 0 ||
    typeof parsed.runnerOwner !== 'string' ||
    parsed.runnerOwner.length === 0 ||
    (parsed.runnerType !== 'Org' && parsed.runnerType !== 'Repo') ||
    (parsed.source !== 'scale-up-lambda' && parsed.source !== 'pool-lambda') ||
    typeof parsed.imageArn !== 'string' ||
    parsed.imageArn.length === 0 ||
    !optionalString(parsed.imageVersion) ||
    !optionalBoolean(parsed.bypassRemoval) ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= createdAt
  ) {
    return undefined;
  }

  return {
    version: METADATA_VERSION,
    microvmId: expectedMicrovmId,
    environment: parsed.environment,
    runnerOwner: parsed.runnerOwner,
    runnerType: parsed.runnerType,
    source: parsed.source,
    imageArn: parsed.imageArn,
    imageVersion: parsed.imageVersion,
    bypassRemoval: parsed.bypassRemoval,
    createdAt: parsed.createdAt as string,
    expiresAt: parsed.expiresAt as string,
  };
}

export async function createMicrovmRunnerMetadata(
  metadataSsmPath: string,
  input: CreateMicrovmRunnerMetadataInput,
): Promise<void> {
  const createdAt = new Date();
  const metadata: MicrovmRunnerMetadata = {
    version: METADATA_VERSION,
    microvmId: input.microvmId,
    environment: input.environment,
    runnerOwner: input.runnerOwner,
    runnerType: input.runnerType,
    source: input.source,
    imageArn: input.imageArn,
    imageVersion: input.imageVersion,
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(
      createdAt.getTime() + (input.maximumDurationInSeconds + EXPIRATION_GRACE_IN_SECONDS) * 1000,
    ).toISOString(),
  };

  await putParameter(microvmMetadataParameterName(metadataSsmPath, input.microvmId), JSON.stringify(metadata), false);
}

function invalidStateReason(parameters: Map<string, string>, baseName: string): string | undefined {
  const orphan = parameters.get(`${baseName}${ORPHAN_SUFFIX}`);
  if (orphan !== undefined && orphan !== 'true' && orphan !== 'false') return 'invalid orphan state';

  const cleanupRequestedAt = parameters.get(`${baseName}${CLEANUP_REQUESTED_AT_SUFFIX}`);
  if (cleanupRequestedAt !== undefined && !Number.isFinite(Date.parse(cleanupRequestedAt))) {
    return 'invalid cleanup request timestamp';
  }
  return undefined;
}

function shouldDeleteMetadata(
  metadata: MicrovmRunnerMetadata,
  state: MicrovmState | undefined,
  cleanupRequestedAt: string | undefined,
  now: number,
): boolean {
  if (state === 'TERMINATED') return true;
  if (state !== undefined) return false;

  const cleanupGraceElapsed =
    cleanupRequestedAt !== undefined && Date.parse(cleanupRequestedAt) + EXPIRATION_GRACE_IN_SECONDS * 1000 <= now;
  return cleanupGraceElapsed || Date.parse(metadata.expiresAt) <= now;
}

export async function listMicrovmRunnerMetadata(
  metadataSsmPath: string,
  microvmStates: ReadonlyMap<string, MicrovmState>,
): Promise<MicrovmRunnerMetadataInventory> {
  const metadataById = new Map<string, MicrovmRunnerMetadata>();
  const cleanupMicrovmIds = new Set<string>();
  const parameters = await getParametersByPath(normalizedPath(metadataSsmPath));
  const parameterPrefix = `${normalizedPath(metadataSsmPath)}/`;
  const now = Date.now();
  const metadataBaseIds = new Set<string>();
  const stateParameterIds = new Set<string>();
  const runnersToDelete = new Set<string>();

  for (const parameterName of parameters.keys()) {
    if (!parameterName.startsWith(parameterPrefix)) continue;
    for (const suffix of [GITHUB_RUNNER_ID_SUFFIX, ORPHAN_SUFFIX, CLEANUP_REQUESTED_AT_SUFFIX]) {
      if (!parameterName.endsWith(suffix)) continue;
      const microvmId = parameterName.slice(parameterPrefix.length, -suffix.length);
      if (MICROVM_ID_PATTERN.test(microvmId)) stateParameterIds.add(microvmId);
      break;
    }
  }

  for (const [parameterName, value] of parameters) {
    if (!parameterName.startsWith(parameterPrefix)) continue;
    const microvmId = parameterName.slice(parameterPrefix.length);
    if (!MICROVM_ID_PATTERN.test(microvmId)) continue;
    metadataBaseIds.add(microvmId);

    const state = microvmStates.get(microvmId);
    const metadata = parseMetadata(value, microvmId);
    if (!metadata) {
      if (state !== undefined && ACTIVE_STATES.has(state)) {
        throw new Error(`Active MicroVM runner '${microvmId}' has invalid ownership metadata`);
      }
      if (state === 'TERMINATED') runnersToDelete.add(microvmId);
      else logger.warn(`Ignoring invalid MicroVM runner metadata for '${microvmId}'`);
      continue;
    }

    const baseName = microvmMetadataParameterName(metadataSsmPath, microvmId);
    const stateError = invalidStateReason(parameters, baseName);
    if (stateError) {
      if (state !== undefined && ACTIVE_STATES.has(state)) {
        throw new Error(`Active MicroVM runner '${microvmId}' has ${stateError}`);
      }
      if (state === 'TERMINATED' || (state === undefined && Date.parse(metadata.expiresAt) <= now)) {
        runnersToDelete.add(microvmId);
      }
      logger.warn(`Ignoring MicroVM runner metadata for '${microvmId}' with ${stateError}`);
      continue;
    }

    const cleanupRequestedAt = parameters.get(`${baseName}${CLEANUP_REQUESTED_AT_SUFFIX}`);
    if (shouldDeleteMetadata(metadata, state, cleanupRequestedAt, now)) {
      runnersToDelete.add(microvmId);
      continue;
    }

    if (state === undefined || !ACTIVE_STATES.has(state)) continue;

    if (cleanupRequestedAt !== undefined) {
      cleanupMicrovmIds.add(microvmId);
      continue;
    }

    metadataById.set(microvmId, {
      ...metadata,
      githubRunnerId: parameters.get(`${baseName}${GITHUB_RUNNER_ID_SUFFIX}`),
      orphan: parameters.get(`${baseName}${ORPHAN_SUFFIX}`) === 'true',
    });
  }

  for (const microvmId of stateParameterIds) {
    if (metadataBaseIds.has(microvmId)) continue;

    const baseName = microvmMetadataParameterName(metadataSsmPath, microvmId);
    const state = microvmStates.get(microvmId);
    const cleanupRequestedAt = parameters.get(`${baseName}${CLEANUP_REQUESTED_AT_SUFFIX}`);
    const stateError = invalidStateReason(parameters, baseName);

    if (stateError && state !== undefined && ACTIVE_STATES.has(state)) {
      throw new Error(`Active MicroVM runner '${microvmId}' has ${stateError}`);
    }
    if (state !== undefined && ACTIVE_STATES.has(state)) {
      if (cleanupRequestedAt === undefined) {
        throw new Error(`Active MicroVM runner '${microvmId}' has state metadata but no ownership metadata`);
      }
      cleanupMicrovmIds.add(microvmId);
      continue;
    }
    if (state === 'TERMINATED') {
      runnersToDelete.add(microvmId);
      continue;
    }
    if (state === undefined) {
      const cleanupGraceElapsed =
        cleanupRequestedAt !== undefined &&
        Number.isFinite(Date.parse(cleanupRequestedAt)) &&
        Date.parse(cleanupRequestedAt) + EXPIRATION_GRACE_IN_SECONDS * 1000 <= now;
      if (cleanupRequestedAt === undefined || stateError !== undefined || cleanupGraceElapsed) {
        runnersToDelete.add(microvmId);
      }
    }
  }

  for (const microvmId of [...runnersToDelete].slice(0, MAX_RECONCILED_RUNNERS)) {
    try {
      await deleteMicrovmRunnerMetadata(metadataSsmPath, microvmId);
    } catch (error) {
      logger.warn(`Failed to delete reconciled MicroVM runner metadata '${microvmId}'`, { error });
    }
  }

  return {
    cleanupMicrovmIds: [...cleanupMicrovmIds],
    metadataById,
  };
}

export async function setMicrovmGithubRunnerId(
  metadataSsmPath: string,
  microvmId: string,
  githubRunnerId: string,
): Promise<void> {
  if (!githubRunnerId) throw new Error('GitHub runner ID must not be empty');
  await putParameter(stateParameterName(metadataSsmPath, microvmId, GITHUB_RUNNER_ID_SUFFIX), githubRunnerId, false, {
    overwrite: true,
  });
}

export async function setMicrovmOrphan(metadataSsmPath: string, microvmId: string, orphan: boolean): Promise<void> {
  await putParameter(stateParameterName(metadataSsmPath, microvmId, ORPHAN_SUFFIX), String(orphan), false, {
    overwrite: true,
  });
}

export async function markMicrovmCleanupPending(metadataSsmPath: string, microvmId: string): Promise<void> {
  await putParameter(
    stateParameterName(metadataSsmPath, microvmId, CLEANUP_REQUESTED_AT_SUFFIX),
    new Date().toISOString(),
    false,
    { overwrite: true },
  );
}

export async function deleteMicrovmRunnerMetadata(metadataSsmPath: string, microvmId: string): Promise<void> {
  for (const parameterName of metadataParameterNames(metadataSsmPath, microvmId)) {
    try {
      await deleteParameter(parameterName);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'ParameterNotFound')) throw error;
    }
  }
}

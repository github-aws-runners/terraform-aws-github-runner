import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { addParameterTags, deleteParameter, getParametersByPath, putParameter } from '@aws-github-runner/aws-ssm-util';
import type { MicrovmState } from '@aws-sdk/client-lambda-microvms';

import type { CreateGitHubRunnerConfig, GitHubRunnerMetadata, LambdaRunnerSource, RunnerType } from '../../../../core';
import { MICROVM_LIFETIME_IN_SECONDS } from './lifetime';

const logger = createChildLogger('microvm-runner-metadata');

const METADATA_VERSION = 1;
const EXPIRATION_GRACE_IN_SECONDS = 300;
const MAX_RECONCILED_RUNNERS = 10;
const MAX_PARAMETER_TAGS = 50;
const MAX_RUNNER_LABEL_TAGS = 5;
const MAX_BASE_PARAMETER_TAGS = MAX_PARAMETER_TAGS - MAX_RUNNER_LABEL_TAGS - 1;
const MAX_TAG_KEY_LENGTH = 128;
const MAX_TAG_VALUE_LENGTH = 256;
const SSM_TAG_VALUE_PATTERN = /^[\p{L}\p{Z}\p{N}_.:/=+\-@]*$/u;
const MICROVM_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const GITHUB_RUNNER_ID_SUFFIX = '.github-runner-id';
const ORPHAN_SUFFIX = '.orphan';
const CLEANUP_REQUESTED_AT_SUFFIX = '.cleanup-requested-at';
const ACTIVE_STATES = new Set<MicrovmState>(['PENDING', 'RUNNING', 'SUSPENDING', 'SUSPENDED']);
type MicrovmMetadataTag = CreateGitHubRunnerConfig['ssmParameterStoreTags'][number];

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
  microvmId: string;
  runnerOwner: string;
  runnerType: RunnerType;
  ssmParameterStoreTags: MicrovmMetadataTag[];
  source: LambdaRunnerSource;
}

function isProviderOwnedLateTag(key: string): boolean {
  return key === 'ghr:github_runner_id' || key === 'ghr:runner_labels' || key.startsWith('ghr:runner_labels:');
}

function assertValidParameterTags(tags: MicrovmMetadataTag[]): void {
  if (tags.length > MAX_PARAMETER_TAGS) {
    throw new Error(`MicroVM metadata cannot have more than ${MAX_PARAMETER_TAGS} tags`);
  }

  for (const tag of tags) {
    if (
      Array.from(tag.Key).length === 0 ||
      Array.from(tag.Key).length > MAX_TAG_KEY_LENGTH ||
      Array.from(tag.Value).length > MAX_TAG_VALUE_LENGTH ||
      !SSM_TAG_VALUE_PATTERN.test(tag.Key) ||
      !SSM_TAG_VALUE_PATTERN.test(tag.Value)
    ) {
      throw new Error(`MicroVM metadata tag '${tag.Key}' does not satisfy SSM tag constraints`);
    }
    if (tag.Key.toLowerCase().startsWith('aws:')) {
      throw new Error(`MicroVM metadata tag '${tag.Key}' uses the AWS-reserved tag prefix`);
    }
  }
}

function mergeParameterTags(...tagSets: MicrovmMetadataTag[][]): MicrovmMetadataTag[] {
  const tagsByKey = new Map<string, string>();
  for (const tags of tagSets) {
    for (const tag of tags) tagsByKey.set(tag.Key, tag.Value);
  }

  return [...tagsByKey].map(([Key, Value]) => ({ Key, Value }));
}

function createMetadataParameterTags(input: CreateMicrovmRunnerMetadataInput): MicrovmMetadataTag[] {
  const configuredTags = mergeParameterTags(input.ssmParameterStoreTags).filter(
    (tag) => !isProviderOwnedLateTag(tag.Key) && tag.Key !== 'ghr:microvm_image_version' && tag.Key !== 'Name',
  );
  const providerTags: MicrovmMetadataTag[] = [
    { Key: 'ghr:Application', Value: 'github-action-runner' },
    { Key: 'ghr:created_by', Value: input.source },
    { Key: 'ghr:environment', Value: input.environment },
    { Key: 'ghr:Owner', Value: input.runnerOwner },
    { Key: 'ghr:Type', Value: input.runnerType },
    { Key: 'ghr:microvm_id', Value: input.microvmId },
    { Key: 'ghr:microvm_image_arn', Value: input.imageArn },
  ];
  if (input.imageVersion !== undefined) {
    providerTags.push({ Key: 'ghr:microvm_image_version', Value: input.imageVersion });
  }

  const tags = mergeParameterTags(configuredTags, providerTags);
  assertValidParameterTags(tags);
  if (tags.length > MAX_BASE_PARAMETER_TAGS) {
    throw new Error(
      `MicroVM metadata cannot have more than ${MAX_BASE_PARAMETER_TAGS} launch tags because ${MAX_RUNNER_LABEL_TAGS + 1} tags are reserved for GitHub runner metadata`,
    );
  }
  return tags;
}

export function assertValidMicrovmMetadataTags(input: CreateMicrovmRunnerMetadataInput): void {
  createMetadataParameterTags(input);
}

function encodeRunnerLabelGroups(labels: string[]): string[] {
  const encodedGroups: string[] = [];
  let group: string[] = [];
  const encode = (values: string[]) => `base64url:${Buffer.from(JSON.stringify(values), 'utf8').toString('base64url')}`;

  for (const label of labels) {
    const candidate = [...group, label];
    if (Array.from(encode(candidate)).length <= MAX_TAG_VALUE_LENGTH) {
      group = candidate;
      continue;
    }
    if (group.length === 0) {
      logger.warn('A GitHub runner label was omitted because its encoded value exceeds the SSM tag limit', {
        labelLength: Array.from(label).length,
      });
      continue;
    }
    encodedGroups.push(encode(group));
    group = [label];
    if (Array.from(encode(group)).length > MAX_TAG_VALUE_LENGTH) {
      logger.warn('A GitHub runner label was omitted because its encoded value exceeds the SSM tag limit', {
        labelLength: Array.from(label).length,
      });
      group = [];
    }
  }
  if (group.length > 0) encodedGroups.push(encode(group));

  if (encodedGroups.length > MAX_RUNNER_LABEL_TAGS) {
    logger.warn('GitHub runner label SSM tags were truncated to avoid exceeding the metadata tag budget', {
      maxRunnerLabelsTagCount: MAX_RUNNER_LABEL_TAGS,
    });
  }
  return encodedGroups.slice(0, MAX_RUNNER_LABEL_TAGS);
}

function createGitHubRunnerMetadataTags(metadata: GitHubRunnerMetadata): MicrovmMetadataTag[] {
  const tags: MicrovmMetadataTag[] = [{ Key: 'ghr:github_runner_id', Value: metadata.githubRunnerId }];
  tags.push(
    ...encodeRunnerLabelGroups(metadata.runnerLabels).map((Value, index) => ({
      Key: index === 0 ? 'ghr:runner_labels' : `ghr:runner_labels:${index + 1}`,
      Value,
    })),
  );
  assertValidParameterTags(tags);
  return tags;
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

export function assertSeparatedMicrovmMetadataPath(metadataSsmPath: string, runnerTokenSsmPath: string): void {
  const metadataPath = normalizedPath(metadataSsmPath);
  const runnerTokenPath = normalizedPath(runnerTokenSsmPath);
  if (
    metadataPath === runnerTokenPath ||
    metadataPath.startsWith(`${runnerTokenPath}/`) ||
    runnerTokenPath.startsWith(`${metadataPath}/`)
  ) {
    throw new Error('MICROVM_METADATA_SSM_PATH must be separate from the runner JIT token path');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isParameterNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'ParameterNotFound' || ('__type' in error && error.__type === 'ParameterNotFound'))
  );
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
      createdAt.getTime() + (MICROVM_LIFETIME_IN_SECONDS + EXPIRATION_GRACE_IN_SECONDS) * 1000,
    ).toISOString(),
  };

  await putParameter(microvmMetadataParameterName(metadataSsmPath, input.microvmId), JSON.stringify(metadata), false, {
    tags: createMetadataParameterTags(input),
  });
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

export async function setMicrovmGithubRunnerMetadata(
  metadataSsmPath: string,
  microvmId: string,
  metadata: GitHubRunnerMetadata,
): Promise<void> {
  if (!metadata.githubRunnerId) throw new Error('GitHub runner ID must not be empty');
  await putParameter(
    stateParameterName(metadataSsmPath, microvmId, GITHUB_RUNNER_ID_SUFFIX),
    metadata.githubRunnerId,
    false,
    {
      overwrite: true,
    },
  );
  try {
    await addParameterTags(
      microvmMetadataParameterName(metadataSsmPath, microvmId),
      createGitHubRunnerMetadataTags(metadata),
    );
  } catch (error) {
    logger.error(`Failed to tag MicroVM runner '${microvmId}' with GitHub runner metadata`, { error });
  }
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
      if (!isParameterNotFound(error)) throw error;
    }
  }
}

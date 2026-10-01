import { createHash, randomUUID } from 'node:crypto';

import {
  LambdaMicrovmsClient,
  ListMicrovmsCommand,
  RunMicrovmCommand,
  TerminateMicrovmCommand,
  type MicrovmItem,
  type RunMicrovmCommandInput,
} from '@aws-sdk/client-lambda-microvms';
import {
  DeleteParameterCommand,
  GetParametersByPathCommand,
  PutParameterCommand,
  SSMClient,
  type Tag,
} from '@aws-sdk/client-ssm';

import type {
  ScaleSetComputeProvider,
  ScaleSetComputeProviderFactoryInput,
  ScaleSetReconcileError,
  ScaleSetReconcileRequest,
  ScaleSetReconcileResult,
  ScaleSetRunnerState,
} from '../../../../scale-set';
import { MICROVM_LIFETIME_IN_SECONDS } from '../control-plane/lifetime';
import { assertSeparatedMicrovmMetadataPath } from '../control-plane/runner-metadata';

const ACTIVE_STATES = new Set(['PENDING', 'RUNNING', 'SUSPENDING', 'SUSPENDED']);
const MAX_JIT_PARAMETER_BYTES = 8 * 1024;
const STANDARD_PARAMETER_BYTES = 4 * 1024;
const MAX_RUNNER_NAME_LENGTH = 64;

export interface MicrovmScaleSetProviderConfig {
  region: string;
  environment: string;
  imageArn: string;
  imageVersion?: string;
  executionRoleArn: string;
  ingressConnectors: string[];
  egressConnectors: string[];
  runnerConfigSsmPath: string;
  runnerTokenSsmPath: string;
  metadataSsmPath: string;
  runnerNamePrefix: string;
  ssmParameterTags: Array<{ Key: string; Value: string }>;
}

export interface MicrovmScaleSetProviderDependencies {
  microvmClient?: LambdaMicrovmsClient;
  ssmClient?: SSMClient;
  now?: () => number;
  id?: () => string;
}

interface OwnedMicrovm {
  id: string;
  state: string;
  startedAt?: Date;
  runnerName?: string;
  runnerId?: number;
}

interface MicrovmOwnershipRecord {
  version: 1;
  microvmId: string;
  environment: string;
  runnerOwner: string;
  runnerType: 'Org' | 'Repo';
  source: 'scale-set-service';
  imageArn: string;
  imageVersion?: string;
  createdAt: string;
  expiresAt: string;
  runnerConfigName: string;
  scaleSetId: number;
  githubScopeHash: string;
  runnerName?: string;
  githubRunnerId?: number;
}

export class MicrovmScaleSetConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MicrovmScaleSetConfigurationError';
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new MicrovmScaleSetConfigurationError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function stringList(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new MicrovmScaleSetConfigurationError(`${name} must be an array of non-empty strings`);
  }
  const normalized = value.map((item) => (item as string).trim());
  if (
    normalized.length > 10 ||
    normalized.some((item) => !/^arn:[^:]+:lambda:[^:]+:(?:[0-9]{12}|aws):network-connector:[^\s]+$/.test(item))
  ) {
    throw new MicrovmScaleSetConfigurationError(`${name} must contain at most 10 Lambda network connector ARNs`);
  }
  return normalized;
}

function ssmPath(value: unknown, name: string): string {
  const path = requiredString(value, name).replace(/\/+$/, '');
  if (!/^\/[A-Za-z0-9_.\-/]+$/.test(path) || path.includes('//') || path.split('/').includes('..')) {
    throw new MicrovmScaleSetConfigurationError(`${name} must be a valid absolute SSM path`);
  }
  return path;
}

export function parseMicrovmScaleSetProviderConfig(value: unknown): MicrovmScaleSetProviderConfig {
  if (!record(value)) throw new MicrovmScaleSetConfigurationError('configuration must be an object');
  const imageVersion = value.imageVersion;
  if (imageVersion !== undefined && imageVersion !== null && typeof imageVersion !== 'string') {
    throw new MicrovmScaleSetConfigurationError('imageVersion must be a string or null');
  }
  const ssmParameterTags = value.ssmParameterTags ?? [];
  if (
    !Array.isArray(ssmParameterTags) ||
    ssmParameterTags.some(
      (tag) =>
        !record(tag) ||
        typeof tag.Key !== 'string' ||
        typeof tag.Value !== 'string' ||
        tag.Key.length === 0 ||
        tag.Key.length > 128 ||
        tag.Value.length > 256 ||
        !/^[\p{L}\p{Z}\p{N}_.:/=+\-@]*$/u.test(tag.Key) ||
        !/^[\p{L}\p{Z}\p{N}_.:/=+\-@]*$/u.test(tag.Value) ||
        tag.Key.toLowerCase().startsWith('aws:'),
    )
  ) {
    throw new MicrovmScaleSetConfigurationError('ssmParameterTags contains an invalid SSM tag');
  }
  if (ssmParameterTags.length > 44) {
    throw new MicrovmScaleSetConfigurationError('ssmParameterTags must contain at most 44 entries');
  }
  const config: MicrovmScaleSetProviderConfig = {
    region: requiredString(value.region, 'region'),
    environment: requiredString(value.environment, 'environment'),
    imageArn: requiredString(value.imageArn, 'imageArn'),
    ...(typeof imageVersion === 'string' && imageVersion.trim() !== '' ? { imageVersion: imageVersion.trim() } : {}),
    executionRoleArn: requiredString(value.executionRoleArn, 'executionRoleArn'),
    ingressConnectors: stringList(value.ingressConnectors ?? [], 'ingressConnectors'),
    egressConnectors: stringList(value.egressConnectors ?? [], 'egressConnectors'),
    runnerConfigSsmPath: ssmPath(value.runnerConfigSsmPath, 'runnerConfigSsmPath'),
    runnerTokenSsmPath: ssmPath(value.runnerTokenSsmPath, 'runnerTokenSsmPath'),
    metadataSsmPath: ssmPath(value.metadataSsmPath, 'metadataSsmPath'),
    runnerNamePrefix: typeof value.runnerNamePrefix === 'string' ? value.runnerNamePrefix : '',
    ssmParameterTags: ssmParameterTags as Array<{ Key: string; Value: string }>,
  };
  if (!/^arn:[^:]+:lambda:[^:]+:[0-9]{12}:microvm-image:.+$/.test(config.imageArn)) {
    throw new MicrovmScaleSetConfigurationError('imageArn must be a Lambda MicroVM image ARN');
  }
  if (config.imageVersion !== undefined && !/^[A-Za-z0-9_.-]{1,128}$/.test(config.imageVersion)) {
    throw new MicrovmScaleSetConfigurationError('imageVersion must be a valid MicroVM image version');
  }
  assertSeparatedMicrovmMetadataPath(config.metadataSsmPath, config.runnerTokenSsmPath);
  if (config.runnerNamePrefix.length > 45) {
    throw new MicrovmScaleSetConfigurationError('runnerNamePrefix must not exceed 45 characters');
  }
  return config;
}

function createRunHookPayload(config: MicrovmScaleSetProviderConfig): string {
  return JSON.stringify({
    version: 1,
    ...(config.imageVersion === undefined ? {} : { imageArn: config.imageArn, imageVersion: config.imageVersion }),
    runnerConfigSsmPath: config.runnerConfigSsmPath,
    runnerTokenSsmPath: config.runnerTokenSsmPath,
  });
}

function githubScopeHash(scope: string): string {
  return createHash('sha256').update(scope).digest('hex');
}

function runnerName(prefix: string, microvmId: string): string {
  const safeId = microvmId.replace(/[^A-Za-z0-9-]/g, '-');
  const suffix = `${safeId.slice(0, 40) || 'runner'}-${createHash('sha256').update(microvmId).digest('hex').slice(0, 8)}`;
  const maxPrefixLength = MAX_RUNNER_NAME_LENGTH - suffix.length - 1;
  return `${(prefix || 'ghr').slice(0, maxPrefixLength)}-${suffix}`;
}

function runnerIdentityFromScope(scope: string): { runnerOwner: string; runnerType: 'Org' | 'Repo' } {
  try {
    const segments = new URL(scope).pathname.split('/').filter(Boolean);
    if (segments.length === 0) {
      throw new MicrovmScaleSetConfigurationError('githubScope must include an organization or repository');
    }
    if (segments[0]?.toLowerCase() === 'enterprises' && segments[1]) {
      return { runnerOwner: segments[1], runnerType: 'Org' };
    }
    return segments.length > 1
      ? { runnerOwner: segments.slice(0, 2).join('/'), runnerType: 'Repo' }
      : { runnerOwner: segments[0] ?? '', runnerType: 'Org' };
  } catch {
    throw new MicrovmScaleSetConfigurationError('githubScope must be a valid URL');
  }
}

function toMicrovmTags(input: ScaleSetComputeProviderFactoryInput, config: MicrovmScaleSetProviderConfig): Tag[] {
  const merged = new Map<string, string>(config.ssmParameterTags.map(({ Key, Value }) => [Key, Value] as const));
  for (const { Key, Value } of [
    { Key: 'ghr:Application', Value: 'github-action-runner' },
    { Key: 'ghr:created_by', Value: 'scale-set-service' },
    { Key: 'ghr:environment', Value: config.environment },
    { Key: 'ghr:runner_config', Value: input.runnerConfigName },
    { Key: 'ghr:scale_set_id', Value: String(input.scaleSetId) },
    { Key: 'ghr:github_scope_sha256', Value: githubScopeHash(input.githubScope) },
  ]) merged.set(Key, Value);
  return [...merged].map(([Key, Value]) => ({ Key, Value }));
}

function ownershipRecord(
  input: ScaleSetComputeProviderFactoryInput,
  config: MicrovmScaleSetProviderConfig,
  microvmId: string,
  githubScopeHashValue: string,
  details: { runnerName?: string; runnerId?: number } = {},
  now = Date.now(),
): MicrovmOwnershipRecord {
  const createdAt = new Date(now);
  const runnerIdentity = runnerIdentityFromScope(input.githubScope);
  return {
    version: 1,
    microvmId,
    environment: config.environment,
    runnerOwner: runnerIdentity.runnerOwner,
    runnerType: runnerIdentity.runnerType,
    source: 'scale-set-service',
    imageArn: config.imageArn,
    ...(config.imageVersion === undefined ? {} : { imageVersion: config.imageVersion }),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + (MICROVM_LIFETIME_IN_SECONDS + 300) * 1000).toISOString(),
    runnerConfigName: input.runnerConfigName,
    scaleSetId: input.scaleSetId,
    githubScopeHash: githubScopeHashValue,
    ...details,
  };
}

function parseOwnership(value: string | undefined, id: string): MicrovmOwnershipRecord | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !record(parsed) ||
      parsed.version !== 1 ||
      parsed.microvmId !== id ||
      parsed.source !== 'scale-set-service' ||
      typeof parsed.environment !== 'string' ||
      typeof parsed.runnerConfigName !== 'string' ||
      !Number.isSafeInteger(parsed.scaleSetId) ||
      typeof parsed.githubScopeHash !== 'string' ||
      (parsed.runnerType !== 'Org' && parsed.runnerType !== 'Repo') ||
      (parsed.runnerName !== undefined && typeof parsed.runnerName !== 'string') ||
      (parsed.githubRunnerId !== undefined &&
        (!Number.isSafeInteger(parsed.githubRunnerId) || (parsed.githubRunnerId as number) <= 0))
    ) {
      return undefined;
    }
    return parsed as unknown as MicrovmOwnershipRecord;
  } catch {
    return undefined;
  }
}

function errorCode(error: unknown): string {
  if (error instanceof MicrovmScaleSetConfigurationError) return 'INVALID_CONFIGURATION';
  if (!record(error)) return 'UNEXPECTED_ERROR';
  for (const candidate of [error.name, error.code]) {
    if (typeof candidate === 'string' && /^[A-Za-z][A-Za-z0-9._-]{0,127}$/.test(candidate)) return candidate;
  }
  return 'UNEXPECTED_ERROR';
}

async function deleteParameterIfPresent(client: SSMClient, name: string, signal: AbortSignal): Promise<void> {
  try {
    await client.send(new DeleteParameterCommand({ Name: name }), { abortSignal: signal });
  } catch (error) {
    if (error instanceof Error && ['ParameterNotFound', 'ParameterNotFoundException'].includes(error.name)) return;
    throw error;
  }
}

function result(
  desiredRunners: number,
  currentRunners: number,
  actions: ScaleSetReconcileResult['actions'],
  errors: ScaleSetReconcileError[],
): ScaleSetReconcileResult {
  if (currentRunners < desiredRunners && errors.length === 0) {
    errors.push({ operation: 'reconcile', code: 'CAPACITY_NOT_PROVISIONED' });
  }
  return {
    status: errors.length > 0 || currentRunners < desiredRunners ? 'error' : currentRunners > desiredRunners ? 'retained' : 'converged',
    desiredRunners,
    currentRunners,
    actions,
    errors,
  };
}

async function listMicrovms(client: LambdaMicrovmsClient, signal: AbortSignal): Promise<MicrovmItem[]> {
  const items: MicrovmItem[] = [];
  let nextToken: string | undefined;
  do {
    const page = await client.send(new ListMicrovmsCommand({ maxResults: 50, nextToken }), { abortSignal: signal });
    items.push(...(page.items ?? []));
    nextToken = page.nextToken;
  } while (nextToken);
  return items;
}

async function readMetadata(client: SSMClient, path: string, signal: AbortSignal): Promise<Map<string, string>> {
  const parameters = new Map<string, string>();
  let nextToken: string | undefined;
  do {
    const page = await client.send(
      new GetParametersByPathCommand({ Path: path, Recursive: true, WithDecryption: false, NextToken: nextToken }),
      { abortSignal: signal },
    );
    for (const item of page.Parameters ?? []) {
      if (item.Name && item.Value !== undefined) parameters.set(item.Name, item.Value);
    }
    nextToken = page.NextToken;
  } while (nextToken);
  return parameters;
}

function matchingRunnerState(runner: OwnedMicrovm, states: readonly ScaleSetRunnerState[], scaleSetId: number) {
  if (runner.runnerId === undefined) return undefined;
  const matches = states.filter(
    (state) => state.runnerId === runner.runnerId && state.scaleSetId === scaleSetId && state.runnerName === runner.runnerName,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function scaleDownRunnerState(
  runner: OwnedMicrovm,
  states: readonly ScaleSetRunnerState[],
  scaleSetId: number,
  aggregateBusyRunners: number,
): ScaleSetRunnerState | undefined {
  const exact = matchingRunnerState(runner, states, scaleSetId);
  if (exact) return exact;
  if (aggregateBusyRunners !== 0 || runner.runnerId === undefined || runner.runnerName === undefined) return undefined;
  if (states.some((state) =>
    state.scaleSetId === scaleSetId &&
    (state.runnerId === runner.runnerId || state.runnerName === runner.runnerName),
  )) return undefined;
  return {
    runnerId: runner.runnerId,
    runnerName: runner.runnerName,
    scaleSetId,
    status: 'unknown',
    busy: false,
    lifecycle: 'unknown',
  };
}

function isServing(runner: OwnedMicrovm, states: readonly ScaleSetRunnerState[], scaleSetId: number, bootTimeoutMinutes: number, now: number): boolean {
  const state = matchingRunnerState(runner, states, scaleSetId);
  if (state && (state.status === 'online' || state.busy === true)) return true;
  return runner.startedAt !== undefined && runner.startedAt.getTime() + bootTimeoutMinutes * 60_000 > now;
}

export function createMicrovmScaleSetProvider(
  input: ScaleSetComputeProviderFactoryInput,
  dependencies: MicrovmScaleSetProviderDependencies = {},
): ScaleSetComputeProvider {
  const config = parseMicrovmScaleSetProviderConfig(input.configuration);
  if (!Number.isSafeInteger(input.scaleSetId) || input.scaleSetId <= 0) {
    throw new MicrovmScaleSetConfigurationError('scaleSetId must be a positive integer');
  }
  const credentials = input.credentials;
  const microvms = dependencies.microvmClient ?? new LambdaMicrovmsClient({ region: config.region, credentials });
  const ssm = dependencies.ssmClient ?? new SSMClient({ region: config.region, credentials });
  const now = dependencies.now ?? Date.now;
  const createId = dependencies.id ?? randomUUID;
  const scopeHash = githubScopeHash(input.githubScope);
  const metadataPrefix = `${config.metadataSsmPath.replace(/\/+$/, '')}/`;
  const tokenPrefix = config.runnerTokenSsmPath.replace(/\/+$/, '');

  async function reconcile(request: ScaleSetReconcileRequest): Promise<ScaleSetReconcileResult> {
    request.signal.throwIfAborted();
    const actions = { launched: 0, terminated: 0, retainedBusy: 0, retainedUnknown: 0 };
    const errors: ScaleSetReconcileError[] = [];
    if (!Number.isSafeInteger(request.desiredRunners) || request.desiredRunners < 0 || request.desiredRunners > 10000) {
      return result(request.desiredRunners, 0, actions, [{ operation: 'validate', code: 'INVALID_DESIRED_RUNNER_COUNT' }]);
    }
    if (
      !Number.isSafeInteger(request.busyRunners) ||
      request.busyRunners < 0 ||
      !Number.isSafeInteger(request.bootTimeoutMinutes) ||
      request.bootTimeoutMinutes < 1 ||
      request.bootTimeoutMinutes > 120
    ) {
      return result(request.desiredRunners, 0, actions, [{ operation: 'validate', code: 'INVALID_RECONCILE_SETTINGS' }]);
    }

    let inventory: OwnedMicrovm[];
    try {
      const [items, parameters] = await Promise.all([
        listMicrovms(microvms, request.signal),
        readMetadata(ssm, config.metadataSsmPath, request.signal),
      ]);
      inventory = items.flatMap((item) => {
        if (!item.microvmId || !item.state || !ACTIVE_STATES.has(item.state)) return [];
        const metadata = parseOwnership(parameters.get(`${metadataPrefix}${item.microvmId}`), item.microvmId);
        if (!metadata || metadata.environment !== config.environment || metadata.runnerConfigName !== input.runnerConfigName ||
            metadata.scaleSetId !== input.scaleSetId || metadata.githubScopeHash !== scopeHash) return [];
        return [{
          id: item.microvmId,
          state: item.state,
          startedAt: item.startedAt,
          runnerName: metadata.runnerName,
          runnerId: metadata.githubRunnerId,
        }];
      });
    } catch (error) {
      request.signal.throwIfAborted();
      return result(request.desiredRunners, 0, actions, [{ operation: 'list', code: errorCode(error) }]);
    }

    let serving = inventory.filter((runner) => isServing(runner, request.runnerStates, input.scaleSetId, request.bootTimeoutMinutes, now()));
    let current = inventory.length;
    while (serving.length < request.desiredRunners) {
      request.signal.throwIfAborted();
      let microvmId: string | undefined;
      let jitIdentity: { runnerId: number; runnerName: string; scaleSetId: number } | undefined;
      let operation: ScaleSetReconcileError['operation'] = 'launch';
      try {
        const runInput: RunMicrovmCommandInput = {
          imageIdentifier: config.imageArn,
          ...(config.imageVersion === undefined ? {} : { imageVersion: config.imageVersion }),
          executionRoleArn: config.executionRoleArn,
          ingressNetworkConnectors: config.ingressConnectors.length ? config.ingressConnectors : undefined,
          egressNetworkConnectors: config.egressConnectors.length ? config.egressConnectors : undefined,
          maximumDurationInSeconds: MICROVM_LIFETIME_IN_SECONDS,
          runHookPayload: createRunHookPayload(config),
          clientToken: createId(),
        };
        const launched = await microvms.send(new RunMicrovmCommand(runInput), { abortSignal: request.signal });
        microvmId = launched.microvmId;
        if (!microvmId) throw new Error('RunMicrovm returned no microvmId');
        current++;
        const name = runnerName(config.runnerNamePrefix, microvmId);
        const createdAt = now();
        const ownership = ownershipRecord(input, config, microvmId, scopeHash, { runnerName: name }, createdAt);
        const tags = toMicrovmTags(input, config);
        await ssm.send(new PutParameterCommand({
          Name: `${metadataPrefix}${microvmId}`,
          Value: JSON.stringify(ownership),
          Type: 'String',
          Overwrite: false,
          Tags: tags,
        }), { abortSignal: request.signal });
        operation = 'generate_jit_configuration';
        const jit = await request.generateJitConfiguration({ runnerName: name, signal: request.signal });
        if (!Number.isSafeInteger(jit.runnerId) || jit.runnerId <= 0 || jit.runnerName !== name || jit.scaleSetId !== input.scaleSetId) {
          throw new MicrovmScaleSetConfigurationError('JIT configuration returned an unexpected runner identity');
        }
        if (typeof jit.encodedJitConfiguration !== 'string') {
          throw new MicrovmScaleSetConfigurationError('JIT configuration must be a string');
        }
        jitIdentity = { runnerId: jit.runnerId, runnerName: jit.runnerName, scaleSetId: jit.scaleSetId };
        const size = Buffer.byteLength(jit.encodedJitConfiguration, 'utf8');
        if (size === 0 || size > MAX_JIT_PARAMETER_BYTES) {
          throw new MicrovmScaleSetConfigurationError('JIT configuration has an invalid size');
        }
        const updated = ownershipRecord(input, config, microvmId, scopeHash, {
          runnerName: name,
          runnerId: jit.runnerId,
        }, createdAt);
        await ssm.send(new PutParameterCommand({
          Name: `${metadataPrefix}${microvmId}`,
          Value: JSON.stringify(updated),
          Type: 'String',
          Overwrite: true,
        }), { abortSignal: request.signal });
        await ssm.send(new PutParameterCommand({
          Name: `${metadataPrefix}${microvmId}.github-runner-id`,
          Value: String(jit.runnerId),
          Type: 'String',
          Overwrite: true,
        }), { abortSignal: request.signal });
        operation = 'publish_jit_configuration';
        await ssm.send(new PutParameterCommand({
          Name: `${tokenPrefix}/${microvmId}`,
          Value: jit.encodedJitConfiguration,
          Type: 'SecureString',
          Overwrite: false,
          Tier: size >= STANDARD_PARAMETER_BYTES ? 'Advanced' : 'Standard',
        }), { abortSignal: request.signal });
        actions.launched++;
        serving = [...serving, { id: microvmId, state: 'PENDING', startedAt: new Date(createdAt), runnerName: name, runnerId: jit.runnerId }];
      } catch (error) {
        request.signal.throwIfAborted();
        errors.push({ operation, code: errorCode(error), ...(microvmId ? { resourceId: microvmId } : {}) });
        if (microvmId && jitIdentity) {
          try {
            const removal = await request.removeRunner({ ...jitIdentity, signal: request.signal });
            if (removal.status === 'removed') {
              await microvms.send(new TerminateMicrovmCommand({ microvmIdentifier: microvmId }), { abortSignal: request.signal });
              await Promise.all([
                deleteParameterIfPresent(ssm, `${tokenPrefix}/${microvmId}`, request.signal),
                deleteParameterIfPresent(ssm, `${metadataPrefix}${microvmId}`, request.signal),
                deleteParameterIfPresent(ssm, `${metadataPrefix}${microvmId}.github-runner-id`, request.signal),
              ]);
              current--;
              actions.terminated++;
            } else if (removal.status === 'retained_busy') {
              actions.retainedBusy++;
              actions.retainedUnknown++;
            } else {
              actions.retainedUnknown++;
            }
          } catch {
            actions.retainedUnknown++;
          }
        }
        if (microvmId && !jitIdentity) {
          try {
            await microvms.send(new TerminateMicrovmCommand({ microvmIdentifier: microvmId }), { abortSignal: request.signal });
            await Promise.all([
              deleteParameterIfPresent(ssm, `${tokenPrefix}/${microvmId}`, request.signal),
              deleteParameterIfPresent(ssm, `${metadataPrefix}${microvmId}`, request.signal),
            ]);
            current--;
            actions.terminated++;
          } catch {
            actions.retainedUnknown++;
          }
        } else if (microvmId) {
          // The JIT value may have reached Parameter Store even when the write timed out.
          // Preserve the MicroVM and identity so a later reconciliation can observe it safely.
          actions.retainedUnknown++;
        }
        break;
      }
    }

    const scaleDownCandidates = inventory
      .map((runner) => ({
        runner,
        state: scaleDownRunnerState(runner, request.runnerStates, input.scaleSetId, request.busyRunners),
      }))
      .filter((candidate): candidate is { runner: OwnedMicrovm; state: ScaleSetRunnerState } => {
        if (candidate.state === undefined) actions.retainedUnknown++;
        return candidate.state !== undefined;
      })
      .sort((left, right) => (right.runner.startedAt?.getTime() ?? 0) - (left.runner.startedAt?.getTime() ?? 0));
    let excess = Math.max(0, current - request.desiredRunners);
    for (const { runner, state } of scaleDownCandidates) {
      if (excess <= 0) break;
      if (state.lifecycle === 'started' || state.busy === true) {
        actions.retainedBusy++;
        continue;
      }
      if (state.busy === undefined) {
        actions.retainedUnknown++;
        continue;
      }
      if (!(state.busy === false || (state.lifecycle === 'completed' && state.busy !== true))) {
        actions.retainedUnknown++;
        continue;
      }
      try {
        const removal = await request.removeRunner({
          runnerId: state.runnerId,
          runnerName: state.runnerName,
          scaleSetId: state.scaleSetId,
          signal: request.signal,
        });
        if (removal.status !== 'removed') {
          if (removal.status === 'retained_busy') actions.retainedBusy++;
          else actions.retainedUnknown++;
          continue;
        }
        await microvms.send(new TerminateMicrovmCommand({ microvmIdentifier: runner.id }), { abortSignal: request.signal });
        await Promise.all([
          deleteParameterIfPresent(ssm, `${tokenPrefix}/${runner.id}`, request.signal),
          deleteParameterIfPresent(ssm, `${metadataPrefix}${runner.id}`, request.signal),
          deleteParameterIfPresent(ssm, `${metadataPrefix}${runner.id}.github-runner-id`, request.signal),
        ]);
        current--;
        excess--;
        actions.terminated++;
      } catch (error) {
        request.signal.throwIfAborted();
        errors.push({ operation: 'terminate', code: errorCode(error), runnerName: state.runnerName, resourceId: runner.id });
        actions.retainedUnknown++;
      }
    }

    return result(request.desiredRunners, current, actions, errors);
  }

  return { reconcile };
}

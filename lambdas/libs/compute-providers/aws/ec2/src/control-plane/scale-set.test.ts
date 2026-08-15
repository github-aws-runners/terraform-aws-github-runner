import { deleteParameter, putParameter } from '@aws-github-runner/aws-ssm-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CreateScaleSetRunnersInput,
  GetCurrentScaleSetRunnersInput,
  ScaleSetRunnerConfig,
  TerminateSurplusScaleSetRunnersInput,
} from '../../../../core';
import { bootTimeExceeded, createRunner, listEC2Runners, tag, terminateRunner } from './runners';
import { createEc2ScaleSetProvider } from './scale-set';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  deleteParameter: vi.fn(),
  putParameter: vi.fn(),
}));

vi.mock('./runners', () => ({
  createRunner: vi.fn(),
  bootTimeExceeded: vi.fn(),
  listEC2Runners: vi.fn(),
  tag: vi.fn(),
  terminateRunner: vi.fn(),
}));

const mockCreateRunner = vi.mocked(createRunner);
const mockBootTimeExceeded = vi.mocked(bootTimeExceeded);
const mockDeleteParameter = vi.mocked(deleteParameter);
const mockListRunners = vi.mocked(listEC2Runners);
const mockPutParameter = vi.mocked(putParameter);
const mockTag = vi.mocked(tag);
const mockTerminateRunner = vi.mocked(terminateRunner);
const provider = createEc2ScaleSetProvider();
const cleanEnv = process.env;

const runnerConfig: ScaleSetRunnerConfig = {
  scaleSetId: 123,
  runnerNamePrefix: 'scale-set-',
  runnerOwner: 'octo-org',
  runnerType: 'Org',
  ssmTokenPath: '/github-action-runners/default/runners/config',
  ssmParameterStoreTags: [{ Key: 'Environment', Value: 'unit-test' }],
};

function createInput(overrides: Partial<CreateScaleSetRunnersInput> = {}): CreateScaleSetRunnersInput {
  return {
    runnerConfig,
    numberOfRunners: 1,
    generateJitConfig: vi.fn(async ({ runnerName }) => ({
      encodedJitConfig: 'encoded-jit-config',
      runnerId: 1234,
      runnerName,
    })),
    removeRunner: vi.fn(async () => undefined),
    ...overrides,
  };
}

function currentRunnersInput(overrides: Partial<GetCurrentScaleSetRunnersInput> = {}): GetCurrentScaleSetRunnersInput {
  return {
    runnerOwner: 'octo-org',
    runnerType: 'Org',
    scaleSetId: 123,
    runnerNamePrefix: runnerConfig.runnerNamePrefix,
    ssmTokenPath: runnerConfig.ssmTokenPath,
    removeJitRunner: vi.fn(async () => undefined),
    ...overrides,
  };
}

function surplusRunnersInput(
  overrides: Partial<TerminateSurplusScaleSetRunnersInput> = {},
): TerminateSurplusScaleSetRunnersInput {
  return {
    runnerOwner: 'octo-org',
    runnerType: 'Org',
    scaleSetId: 123,
    runnerNamePrefix: runnerConfig.runnerNamePrefix,
    desiredRunners: 2,
    excessRunners: 2,
    ssmTokenPath: runnerConfig.ssmTokenPath,
    removeRunner: vi.fn(async () => undefined),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...cleanEnv };
  process.env.ENVIRONMENT = 'unit-test-environment';
  process.env.LAUNCH_TEMPLATE_NAME = 'lt-1';
  process.env.SUBNET_IDS = 'subnet-123';
  process.env.INSTANCE_TYPES = 'm5.large';
  process.env.INSTANCE_TARGET_CAPACITY_TYPE = 'spot';
  process.env.SCALE_ERRORS = '[]';
  delete process.env.INSTANCE_TYPE_PRIORITIES;
  delete process.env.INSTANCE_MAX_SPOT_PRICE;
  delete process.env.INSTANCE_ALLOCATION_STRATEGY;
  delete process.env.AMI_ID_SSM_PARAMETER_NAME;
  delete process.env.POWERTOOLS_TRACE_ENABLED;
  delete process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS;
  delete process.env.USE_DEDICATED_HOST;

  mockCreateRunner.mockResolvedValue({
    instances: ['i-12345'],
    retryableErrorCount: 0,
    nonRetryableErrorCount: 0,
  });
  mockListRunners.mockResolvedValue([]);
  mockBootTimeExceeded.mockReturnValue(false);
  mockDeleteParameter.mockResolvedValue(undefined);
  mockPutParameter.mockResolvedValue(undefined);
  mockTag.mockResolvedValue(undefined);
  mockTerminateRunner.mockResolvedValue(undefined);
});

describe('EC2 scale-set provider', () => {
  it('counts only active scale-set runners in the requested owner scope', async () => {
    mockListRunners.mockResolvedValue([
      { id: 'i-12345', owner: 'octo-org', type: 'Org', runnerName: 'scale-set-i-12345' },
    ]);

    await expect(provider.getCurrentRunners(currentRunnersInput())).resolves.toBe(1);
    expect(mockListRunners).toHaveBeenCalledWith({
      environment: 'unit-test-environment',
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      scaleSetId: 123,
      source: 'scale-set-lambda',
    });
  });

  it('replaces scale-set instances whose provisioning window expired', async () => {
    const events: string[] = [];
    const removeJitRunner = vi.fn(async ({ runnerId }: { runnerId: number }) => {
      events.push(`remove:${runnerId}`);
    });
    const input = currentRunnersInput({ removeJitRunner });
    mockListRunners.mockResolvedValue([
      { id: 'i-ready', owner: 'octo-org', type: 'Org', scaleSetState: 'ready' },
      { id: 'i-publishing', owner: 'octo-org', type: 'Org', scaleSetState: 'publishing' },
      { id: 'i-published', owner: 'octo-org', type: 'Org', scaleSetState: 'config-published' },
      { id: 'i-provisioning', owner: 'octo-org', type: 'Org', scaleSetState: 'provisioning' },
      {
        id: 'i-expired',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'provisioning',
        githubRunnerId: '7001',
      },
      { id: 'i-stopped', owner: 'octo-org', type: 'Org', scaleSetState: 'stopped', githubRunnerId: '7002' },
    ]);
    mockBootTimeExceeded.mockImplementation(({ id }) => id === 'i-expired');
    mockDeleteParameter.mockImplementation(async (parameterName) => {
      events.push(`delete:${parameterName}`);
      throw Object.assign(new Error('Parameter not found'), {
        name: 'ParameterNotFound',
      });
    });
    mockTerminateRunner.mockImplementation(async (instanceId) => {
      events.push(`terminate:${instanceId}`);
    });

    await expect(provider.getCurrentRunners(input)).resolves.toBe(4);
    expect(mockTerminateRunner).toHaveBeenCalledTimes(2);
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-expired');
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-stopped');
    expect(input.removeJitRunner).toHaveBeenCalledWith({
      runnerId: 7001,
      runnerName: 'scale-set-i-expired',
      scaleSetId: 123,
    });
    expect(input.removeJitRunner).toHaveBeenCalledWith({
      runnerId: 7002,
      runnerName: 'scale-set-i-stopped',
      scaleSetId: 123,
    });
    expect(mockDeleteParameter).toHaveBeenCalledTimes(2);
    expect(mockDeleteParameter).toHaveBeenCalledWith('/github-action-runners/default/runners/config/i-expired');
    expect(mockDeleteParameter).toHaveBeenCalledWith('/github-action-runners/default/runners/config/i-stopped');
    expect(events.indexOf('delete:/github-action-runners/default/runners/config/i-expired')).toBeLessThan(
      events.indexOf('remove:7001'),
    );
    expect(events.indexOf('remove:7001')).toBeLessThan(events.indexOf('terminate:i-expired'));
    expect(events.indexOf('delete:/github-action-runners/default/runners/config/i-stopped')).toBeLessThan(
      events.indexOf('remove:7002'),
    );
    expect(events.indexOf('remove:7002')).toBeLessThan(events.indexOf('terminate:i-stopped'));
  });

  it('fails stale provisioning reconciliation when its JIT config cannot be deleted', async () => {
    const input = currentRunnersInput();
    mockListRunners.mockResolvedValue([
      {
        id: 'i-expired',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'provisioning',
      },
    ]);
    mockBootTimeExceeded.mockReturnValue(true);
    mockDeleteParameter.mockRejectedValue(new Error('SSM unavailable'));

    await expect(provider.getCurrentRunners(input)).rejects.toThrow('SSM unavailable');
    expect(input.removeJitRunner).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('retains reaped compute when tagged GitHub runner cleanup fails', async () => {
    const input = currentRunnersInput({
      removeJitRunner: vi.fn().mockRejectedValue(new Error('GitHub unavailable')),
    });
    mockListRunners.mockResolvedValue([
      {
        id: 'i-stopped',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'stopped',
        githubRunnerId: '7002',
      },
    ]);

    await expect(provider.getCurrentRunners(input)).rejects.toThrow('GitHub unavailable');

    expect(input.removeJitRunner).toHaveBeenCalledWith({
      runnerId: 7002,
      runnerName: 'scale-set-i-stopped',
      scaleSetId: 123,
    });
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('converges a stale publishing fence through retiring before strict cleanup and termination', async () => {
    const events: string[] = [];
    const removeJitRunner = vi.fn(async ({ runnerId }: { runnerId: number }) => {
      events.push(`remove:${runnerId}`);
    });
    mockListRunners.mockResolvedValue([
      {
        id: 'i-publishing',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'publishing',
        githubRunnerId: '7003',
      },
    ]);
    mockBootTimeExceeded.mockReturnValue(true);
    mockDeleteParameter.mockImplementation(async (parameterName) => {
      events.push(`delete:${parameterName}`);
      throw Object.assign(new Error('Parameter not found'), { name: 'ParameterNotFound' });
    });
    mockTag.mockImplementation(async (runnerId, tags) => {
      events.push(`tag:${runnerId}:${tags[0]?.Value}`);
    });
    mockTerminateRunner.mockImplementation(async (runnerId) => {
      events.push(`terminate:${runnerId}`);
    });

    await expect(provider.getCurrentRunners(currentRunnersInput({ removeJitRunner }))).resolves.toBe(0);

    expect(events).toEqual([
      'delete:/github-action-runners/default/runners/config/i-publishing',
      'tag:i-publishing:retiring',
      'remove:7003',
      'terminate:i-publishing',
    ]);
  });

  it('claims and retires a boot-expired config-published runner whose JIT config still exists', async () => {
    const events: string[] = [];
    const removeJitRunner = vi.fn(async ({ runnerId }: { runnerId: number }) => {
      events.push(`remove:${runnerId}`);
    });
    mockListRunners.mockResolvedValue([
      {
        id: 'i-published',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'config-published',
        githubRunnerId: '7004',
      },
    ]);
    mockBootTimeExceeded.mockReturnValue(true);
    mockDeleteParameter.mockImplementation(async (parameterName) => {
      events.push(`delete:${parameterName}`);
    });
    mockTag.mockImplementation(async (runnerId, tags) => {
      events.push(`tag:${runnerId}:${tags[0]?.Value}`);
    });
    mockTerminateRunner.mockImplementation(async (runnerId) => {
      events.push(`terminate:${runnerId}`);
    });

    await expect(provider.getCurrentRunners(currentRunnersInput({ removeJitRunner }))).resolves.toBe(0);

    expect(events).toEqual([
      'delete:/github-action-runners/default/runners/config/i-published',
      'tag:i-published:retiring',
      'remove:7004',
      'terminate:i-published',
    ]);
  });

  it('protects a boot-expired config-published runner when its JIT config is already absent', async () => {
    const input = currentRunnersInput();
    mockListRunners.mockResolvedValue([
      {
        id: 'i-published',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'config-published',
        githubRunnerId: '7005',
      },
    ]);
    mockBootTimeExceeded.mockReturnValue(true);
    mockDeleteParameter.mockRejectedValue(
      Object.assign(new Error('Parameter not found'), { name: 'ParameterNotFound' }),
    );

    await expect(provider.getCurrentRunners(input)).resolves.toBe(1);

    expect(mockDeleteParameter).toHaveBeenCalledWith('/github-action-runners/default/runners/config/i-published');
    expect(mockTag).not.toHaveBeenCalled();
    expect(input.removeJitRunner).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('provisions EC2, generates a deterministic JIT config, and stores it for startup', async () => {
    const input = createInput();

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: ['i-12345'],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 0,
    });

    expect(mockCreateRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        runnerOwner: 'octo-org',
        runnerType: 'Org',
        numberOfRunners: 1,
        source: 'scale-set-lambda',
        additionalTags: [
          { Key: 'ghr:scale_set_id', Value: '123' },
          { Key: 'ghr:scale_set_state', Value: 'provisioning' },
        ],
      }),
    );
    expect(input.generateJitConfig).toHaveBeenCalledWith({ runnerName: 'scale-set-i-12345' });
    expect(mockTag).toHaveBeenNthCalledWith(1, 'i-12345', [
      { Key: 'ghr:runner_name', Value: 'scale-set-i-12345' },
      { Key: 'ghr:github_runner_id', Value: '1234' },
    ]);
    expect(mockTag).toHaveBeenNthCalledWith(2, 'i-12345', [{ Key: 'ghr:scale_set_state', Value: 'publishing' }]);
    expect(mockTag).toHaveBeenNthCalledWith(3, 'i-12345', [{ Key: 'ghr:scale_set_state', Value: 'config-published' }]);
    expect(mockPutParameter).toHaveBeenCalledWith(
      '/github-action-runners/default/runners/config/i-12345',
      'encoded-jit-config',
      true,
      {
        tags: [
          { Key: 'InstanceId', Value: 'i-12345' },
          { Key: 'Environment', Value: 'unit-test' },
        ],
      },
    );
    expect(input.removeRunner).not.toHaveBeenCalled();
  });

  it('terminates and reports a non-retryable failure when JIT configuration is invalid', async () => {
    const input = createInput({
      generateJitConfig: vi.fn(async () => ({
        encodedJitConfig: 'encoded-jit-config',
        runnerId: 1234,
        runnerName: 'unexpected-runner',
      })),
    });

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: [],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 1,
    });
    expect(mockPutParameter).not.toHaveBeenCalled();
    expect(input.removeRunner).toHaveBeenCalledWith({
      runnerId: 1234,
      runnerName: 'scale-set-i-12345',
      scaleSetId: 123,
    });
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-12345');
  });

  it('cancels an ambiguous failed publication before removing the GitHub runner and compute', async () => {
    const events: string[] = [];
    const input = createInput({
      removeRunner: vi.fn(async () => {
        events.push('remove-github');
      }),
    });
    mockPutParameter.mockImplementation(async () => {
      events.push('put-parameter');
      throw new Error('SSM response lost');
    });
    mockDeleteParameter.mockImplementation(async () => {
      events.push('delete-parameter');
    });
    mockTerminateRunner.mockImplementation(async () => {
      events.push('terminate-compute');
    });

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: [],
      retryableErrorCount: 1,
      nonRetryableErrorCount: 0,
    });

    expect(mockTag).toHaveBeenNthCalledWith(2, 'i-12345', [{ Key: 'ghr:scale_set_state', Value: 'publishing' }]);
    expect(mockDeleteParameter).toHaveBeenCalledWith('/github-action-runners/default/runners/config/i-12345');
    expect(input.removeRunner).toHaveBeenCalledWith({
      runnerId: 1234,
      runnerName: 'scale-set-i-12345',
      scaleSetId: 123,
    });
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-12345');
    expect(events).toEqual(['put-parameter', 'delete-parameter', 'remove-github', 'terminate-compute']);
  });

  it('reports a safely cancelled SSM access denial as non-retryable', async () => {
    const input = createInput();
    mockPutParameter.mockRejectedValue(
      Object.assign(new Error('not authorized to publish'), {
        name: 'AccessDeniedException',
        $metadata: { httpStatusCode: 403 },
      }),
    );

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: [],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 1,
    });

    expect(input.removeRunner).toHaveBeenCalledOnce();
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-12345');
  });

  it('keeps an AWS throttling response retryable even when its HTTP status is 400', async () => {
    const input = createInput();
    mockPutParameter.mockRejectedValue(
      Object.assign(new Error('rate exceeded'), {
        name: 'ThrottlingException',
        $metadata: { httpStatusCode: 400 },
      }),
    );

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: [],
      retryableErrorCount: 1,
      nonRetryableErrorCount: 0,
    });
  });

  it('preserves compute but surfaces non-retryable ambiguous publication access denial', async () => {
    const input = createInput();
    const accessDenied = Object.assign(new Error('not authorized'), {
      name: 'AccessDeniedException',
      $metadata: { httpStatusCode: 403 },
    });
    mockPutParameter.mockRejectedValue(accessDenied);
    mockDeleteParameter.mockRejectedValue(accessDenied);

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: ['i-12345'],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 1,
    });

    expect(input.removeRunner).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('reports a GitHub 403 during JIT generation as non-retryable', async () => {
    const input = createInput({
      generateJitConfig: vi.fn().mockRejectedValue(
        Object.assign(new Error('forbidden'), {
          name: 'ScaleSetHttpError',
          status: 403,
        }),
      ),
    });

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: [],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 1,
    });
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-12345');
  });

  it('keeps a GitHub 409 runner conflict retryable', async () => {
    const input = createInput({
      generateJitConfig: vi.fn().mockRejectedValue(
        Object.assign(new Error('runner already exists'), {
          name: 'ScaleSetHttpError',
          status: 409,
        }),
      ),
    });

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: [],
      retryableErrorCount: 1,
      nonRetryableErrorCount: 0,
    });
  });

  it('reports other GitHub client-contract errors as non-retryable', async () => {
    const input = createInput({
      generateJitConfig: vi.fn().mockRejectedValue(
        Object.assign(new Error('method not allowed'), {
          name: 'ScaleSetHttpError',
          status: 405,
        }),
      ),
    });

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: [],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 1,
    });
  });

  it('preserves GitHub and compute state when an absent parameter cannot prove a failed publication was cancelled', async () => {
    const input = createInput();
    mockPutParameter.mockRejectedValue(new Error('SSM response lost'));
    mockDeleteParameter.mockRejectedValue(
      Object.assign(new Error('Parameter not found'), {
        name: 'ParameterNotFound',
      }),
    );

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: ['i-12345'],
      retryableErrorCount: 1,
      nonRetryableErrorCount: 0,
    });

    expect(mockTag).toHaveBeenNthCalledWith(2, 'i-12345', [{ Key: 'ghr:scale_set_state', Value: 'publishing' }]);
    expect(input.removeRunner).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('preserves GitHub and compute state when cancellation fails after an ambiguous publication', async () => {
    const input = createInput();
    mockPutParameter.mockRejectedValue(new Error('SSM response lost'));
    mockDeleteParameter.mockRejectedValue(new Error('SSM delete unavailable'));

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: ['i-12345'],
      retryableErrorCount: 1,
      nonRetryableErrorCount: 0,
    });

    expect(input.removeRunner).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('reports EC2 identifier-tag access denial as non-retryable after safe GitHub cleanup', async () => {
    const input = createInput();
    mockTag.mockRejectedValueOnce(
      Object.assign(new Error('identifier tags denied'), {
        name: 'AccessDeniedException',
        $metadata: { httpStatusCode: 403 },
      }),
    );

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: [],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 1,
    });

    expect(mockPutParameter).not.toHaveBeenCalled();
    expect(input.removeRunner).toHaveBeenCalledWith({
      runnerId: 1234,
      runnerName: 'scale-set-i-12345',
      scaleSetId: 123,
    });
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-12345');
  });

  it('accepts a publication tag response failure when exact instance state confirms publication', async () => {
    const input = createInput();
    mockTag
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('tag response lost'));
    mockListRunners.mockResolvedValue([
      {
        id: 'i-12345',
        owner: 'octo-org',
        type: 'Org',
        runnerName: 'scale-set-i-12345',
        scaleSetState: 'config-published',
      },
    ]);

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: ['i-12345'],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 0,
    });
    expect(input.removeRunner).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('preserves a bootstrap-gated instance after JIT publication when the fence tag fails', async () => {
    const input = createInput();
    mockTag
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('tag failed'));
    mockListRunners.mockResolvedValue([
      {
        id: 'i-12345',
        owner: 'octo-org',
        type: 'Org',
        runnerName: 'scale-set-i-12345',
        scaleSetState: 'provisioning',
      },
    ]);

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: ['i-12345'],
      retryableErrorCount: 1,
      nonRetryableErrorCount: 0,
    });
    expect(input.removeRunner).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('preserves an instance when publication-tag read-back is ambiguous', async () => {
    const input = createInput();
    mockTag
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('tag response lost'));
    mockListRunners.mockResolvedValue([]);

    await expect(provider.createRunners(input)).resolves.toEqual({
      instances: ['i-12345'],
      retryableErrorCount: 1,
      nonRetryableErrorCount: 0,
    });
    expect(input.removeRunner).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('terminates only surplus provisioning or config-published runners in the exact scale-set scope', async () => {
    const events: string[] = [];
    const input = surplusRunnersInput({
      desiredRunners: 2,
      excessRunners: 3,
      removeRunner: vi.fn(async ({ runnerId }) => {
        events.push(`remove:${runnerId}`);
      }),
    });
    mockDeleteParameter.mockImplementation(async (parameterName) => {
      events.push(`delete:${parameterName}`);
    });
    mockTag.mockImplementation(async (runnerId, tags) => {
      events.push(`tag:${runnerId}:${tags[0]?.Value}`);
    });
    mockListRunners.mockResolvedValue([
      { id: 'i-ready', owner: 'octo-org', type: 'Org', scaleSetState: 'ready', githubRunnerId: '7000' },
      {
        id: 'i-publishing',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'publishing',
        githubRunnerId: '7006',
      },
      {
        id: 'i-provisioning',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'provisioning',
        githubRunnerId: '7001',
      },
      {
        id: 'i-published',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'config-published',
        githubRunnerId: '7002',
      },
      { id: 'i-unknown', owner: 'octo-org', type: 'Org', githubRunnerId: '7003' },
      {
        id: 'i-protected',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'config-published',
        githubRunnerId: '7004',
        bypassRemoval: true,
      },
      { id: 'i-stopped', owner: 'octo-org', type: 'Org', scaleSetState: 'stopped', githubRunnerId: '7005' },
    ]);
    mockTerminateRunner.mockImplementation(async (instanceId) => {
      events.push(`terminate:${instanceId}`);
    });

    await expect(provider.terminateSurplusRunners(input)).resolves.toBe(2);
    expect(mockListRunners).toHaveBeenCalledWith({
      environment: 'unit-test-environment',
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      scaleSetId: 123,
      source: 'scale-set-lambda',
    });
    expect(input.removeRunner).toHaveBeenCalledTimes(2);
    expect(input.removeRunner).toHaveBeenCalledWith({
      runnerId: 7001,
      runnerName: 'scale-set-i-provisioning',
      scaleSetId: 123,
    });
    expect(input.removeRunner).toHaveBeenCalledWith({
      runnerId: 7002,
      runnerName: 'scale-set-i-published',
      scaleSetId: 123,
    });
    expect(mockDeleteParameter).toHaveBeenCalledWith('/github-action-runners/default/runners/config/i-provisioning');
    expect(mockDeleteParameter).toHaveBeenCalledWith('/github-action-runners/default/runners/config/i-published');
    expect(mockDeleteParameter).toHaveBeenCalledTimes(2);
    expect(mockTerminateRunner).toHaveBeenCalledTimes(2);
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-provisioning');
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-published');
    expect(mockTag).toHaveBeenCalledWith('i-provisioning', [{ Key: 'ghr:scale_set_state', Value: 'retiring' }]);
    expect(mockTag).toHaveBeenCalledWith('i-published', [{ Key: 'ghr:scale_set_state', Value: 'retiring' }]);
    expect(events.indexOf('delete:/github-action-runners/default/runners/config/i-provisioning')).toBeLessThan(
      events.indexOf('tag:i-provisioning:retiring'),
    );
    expect(events.indexOf('tag:i-provisioning:retiring')).toBeLessThan(events.indexOf('remove:7001'));
    expect(events.indexOf('remove:7001')).toBeLessThan(events.indexOf('terminate:i-provisioning'));
    expect(events.indexOf('delete:/github-action-runners/default/runners/config/i-published')).toBeLessThan(
      events.indexOf('tag:i-published:retiring'),
    );
    expect(events.indexOf('tag:i-published:retiring')).toBeLessThan(events.indexOf('remove:7002'));
    expect(events.indexOf('remove:7002')).toBeLessThan(events.indexOf('terminate:i-published'));
  });

  it('rechecks desired capacity and terminates newest provisioning capacity first', async () => {
    const input = surplusRunnersInput({ desiredRunners: 2, excessRunners: 10 });
    mockListRunners.mockResolvedValue([
      {
        id: 'i-old-provisioning',
        owner: 'octo-org',
        type: 'Org',
        launchTime: new Date('2026-08-14T10:00:00Z'),
        scaleSetState: 'provisioning',
        githubRunnerId: '7001',
      },
      {
        id: 'i-new-provisioning',
        owner: 'octo-org',
        type: 'Org',
        launchTime: new Date('2026-08-14T11:00:00Z'),
        scaleSetState: 'provisioning',
        githubRunnerId: '7002',
      },
      {
        id: 'i-published',
        owner: 'octo-org',
        type: 'Org',
        launchTime: new Date('2026-08-14T12:00:00Z'),
        scaleSetState: 'config-published',
        githubRunnerId: '7003',
      },
    ]);

    await expect(provider.terminateSurplusRunners(input)).resolves.toBe(1);
    expect(mockTerminateRunner).toHaveBeenCalledOnce();
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-new-provisioning');
  });

  it('retains retiring compute when GitHub cleanup fails', async () => {
    const input = surplusRunnersInput({
      desiredRunners: 0,
      excessRunners: 1,
      removeRunner: vi.fn(async () => {
        throw new Error('GitHub unavailable');
      }),
    });
    mockListRunners.mockResolvedValue([
      {
        id: 'i-provisioning',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'provisioning',
        githubRunnerId: '7001',
      },
    ]);

    await expect(provider.terminateSurplusRunners(input)).rejects.toThrow('GitHub unavailable');
    expect(input.removeRunner).toHaveBeenCalledWith({
      runnerId: 7001,
      runnerName: 'scale-set-i-provisioning',
      scaleSetId: 123,
    });
    expect(mockTag).toHaveBeenCalledWith('i-provisioning', [{ Key: 'ghr:scale_set_state', Value: 'retiring' }]);
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('protects a candidate whose JIT config is already absent', async () => {
    const input = surplusRunnersInput({ desiredRunners: 0, excessRunners: 1 });
    const parameterNotFound = Object.assign(new Error('Parameter not found'), {
      name: 'ParameterNotFound',
    });
    mockDeleteParameter.mockRejectedValue(parameterNotFound);
    mockListRunners.mockResolvedValue([
      {
        id: 'i-claimed',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'config-published',
        githubRunnerId: '7001',
      },
    ]);

    await expect(provider.terminateSurplusRunners(input)).resolves.toBe(0);
    expect(input.removeRunner).not.toHaveBeenCalled();
    expect(mockTag).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('fails reconciliation when the JIT config cannot be claimed', async () => {
    const input = surplusRunnersInput({ desiredRunners: 0, excessRunners: 1 });
    mockDeleteParameter.mockRejectedValue(new Error('SSM unavailable'));
    mockListRunners.mockResolvedValue([
      {
        id: 'i-published',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'config-published',
        githubRunnerId: '7001',
      },
    ]);

    await expect(provider.terminateSurplusRunners(input)).rejects.toThrow('SSM unavailable');
    expect(input.removeRunner).not.toHaveBeenCalled();
    expect(mockTag).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('continues past an already-claimed candidate to terminate another safe candidate', async () => {
    const input = surplusRunnersInput({ desiredRunners: 1, excessRunners: 1 });
    const parameterNotFound = Object.assign(new Error('Parameter not found'), {
      name: 'ParameterNotFound',
    });
    mockDeleteParameter.mockRejectedValueOnce(parameterNotFound).mockResolvedValueOnce(undefined);
    mockListRunners.mockResolvedValue([
      {
        id: 'i-first',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'provisioning',
        githubRunnerId: '7001',
      },
      {
        id: 'i-second',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'provisioning',
        githubRunnerId: '7002',
      },
    ]);

    await expect(provider.terminateSurplusRunners(input)).resolves.toBe(1);
    expect(mockDeleteParameter).toHaveBeenCalledTimes(2);
    expect(input.removeRunner).toHaveBeenCalledOnce();
    expect(input.removeRunner).toHaveBeenCalledWith({
      runnerId: 7002,
      runnerName: 'scale-set-i-second',
      scaleSetId: 123,
    });
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-second');
  });

  it('does not clean up or terminate when the retiring state cannot be persisted', async () => {
    const input = surplusRunnersInput({ desiredRunners: 0, excessRunners: 1 });
    mockListRunners.mockResolvedValue([
      {
        id: 'i-published',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'config-published',
        githubRunnerId: '7001',
      },
    ]);
    mockTag.mockRejectedValue(new Error('tag failed'));

    await expect(provider.terminateSurplusRunners(input)).rejects.toThrow('tag failed');
    expect(input.removeRunner).not.toHaveBeenCalled();
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });

  it('retries cleanup and termination for a previously claimed retiring runner', async () => {
    const removeJitRunner = vi.fn(async () => undefined);
    mockListRunners.mockResolvedValue([
      {
        id: 'i-retiring',
        owner: 'octo-org',
        type: 'Org',
        scaleSetState: 'retiring',
        githubRunnerId: '7001',
      },
    ]);

    await expect(provider.getCurrentRunners(currentRunnersInput({ removeJitRunner }))).resolves.toBe(0);
    expect(mockDeleteParameter).not.toHaveBeenCalled();
    expect(removeJitRunner).toHaveBeenCalledWith({
      runnerId: 7001,
      runnerName: 'scale-set-i-retiring',
      scaleSetId: 123,
    });
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-retiring');
  });

  it('rejects invalid surplus reconciliation counts before listing compute', async () => {
    await expect(provider.terminateSurplusRunners(surplusRunnersInput({ desiredRunners: -1 }))).rejects.toThrow(
      'desired runner count must be a non-negative integer',
    );
    await expect(provider.terminateSurplusRunners(surplusRunnersInput({ excessRunners: 1.5 }))).rejects.toThrow(
      'excess runner count must be a non-negative integer',
    );
    expect(mockListRunners).not.toHaveBeenCalled();
  });

  it('rejects an invalid scale-set ID before creating compute', async () => {
    await expect(
      provider.createRunners(
        createInput({
          runnerConfig: { ...runnerConfig, scaleSetId: 0 },
        }),
      ),
    ).rejects.toThrow('A positive integer scale-set ID is required');
    expect(mockCreateRunner).not.toHaveBeenCalled();
    expect(mockTag).not.toHaveBeenCalled();
  });

  it('marks a started runner ready only after an exact scoped lookup', async () => {
    mockListRunners.mockResolvedValue([
      { id: 'i-12345', owner: 'octo-org', type: 'Org', runnerName: 'scale-set-i-12345' },
    ]);

    await provider.markRunnerStarted({
      runnerName: 'scale-set-i-12345',
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      scaleSetId: 123,
    });

    expect(mockListRunners).toHaveBeenCalledWith({
      environment: 'unit-test-environment',
      runnerName: 'scale-set-i-12345',
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      scaleSetId: 123,
      source: 'scale-set-lambda',
    });
    expect(mockTag).toHaveBeenCalledWith('i-12345', [{ Key: 'ghr:scale_set_state', Value: 'ready' }]);
  });

  it('treats a missing started runner as an idempotent no-op', async () => {
    await expect(
      provider.markRunnerStarted({
        runnerName: 'scale-set-missing',
        runnerOwner: 'octo-org',
        runnerType: 'Org',
        scaleSetId: 123,
      }),
    ).resolves.toBeUndefined();
    expect(mockTag).not.toHaveBeenCalled();
  });

  it('refuses ambiguous started-runner matches', async () => {
    mockListRunners.mockResolvedValue([
      { id: 'i-12345', owner: 'octo-org', type: 'Org', runnerName: 'duplicate' },
      { id: 'i-67890', owner: 'octo-org', type: 'Org', runnerName: 'duplicate' },
    ]);

    await expect(
      provider.markRunnerStarted({
        runnerName: 'duplicate',
        runnerOwner: 'octo-org',
        runnerType: 'Org',
        scaleSetId: 123,
      }),
    ).rejects.toThrow('Refusing to mark');
    expect(mockTag).not.toHaveBeenCalled();
  });

  it('terminates a completed runner only after an exact scoped lookup', async () => {
    mockListRunners.mockResolvedValue([
      { id: 'i-12345', owner: 'octo-org', type: 'Org', runnerName: 'scale-set-i-12345' },
    ]);

    await provider.terminateCompletedRunner({
      runnerName: 'scale-set-i-12345',
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      scaleSetId: 123,
    });

    expect(mockListRunners).toHaveBeenCalledWith({
      environment: 'unit-test-environment',
      runnerName: 'scale-set-i-12345',
      runnerOwner: 'octo-org',
      runnerType: 'Org',
      scaleSetId: 123,
      source: 'scale-set-lambda',
    });
    expect(mockTerminateRunner).toHaveBeenCalledWith('i-12345');
  });

  it('refuses ambiguous completion matches', async () => {
    mockListRunners.mockResolvedValue([
      { id: 'i-12345', owner: 'octo-org', type: 'Org', runnerName: 'duplicate' },
      { id: 'i-67890', owner: 'octo-org', type: 'Org', runnerName: 'duplicate' },
    ]);

    await expect(
      provider.terminateCompletedRunner({
        runnerName: 'duplicate',
        runnerOwner: 'octo-org',
        runnerType: 'Org',
        scaleSetId: 123,
      }),
    ).rejects.toThrow('Refusing to terminate');
    expect(mockTerminateRunner).not.toHaveBeenCalled();
  });
});

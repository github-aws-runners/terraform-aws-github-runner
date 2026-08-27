import type { Octokit } from '@octokit/rest';
import type { CreateGitHubRunnerConfig, CreateStartRunnerConfig, RunnerInfo } from '../../../../core';
import { bootTimeExceeded, listEC2Runners } from '../runners';
import { calculateEc2PoolSize, createEc2PoolProvider } from './pool';
import { createRunners, type Ec2ProviderConfig, loadEc2ProviderConfig } from './runner-config';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../runners', () => ({
  bootTimeExceeded: vi.fn(),
  listEC2Runners: vi.fn(),
}));

vi.mock('./runner-config', () => ({
  createRunners: vi.fn(),
  loadEc2ProviderConfig: vi.fn(),
}));

const mockBootTimeExceeded = vi.mocked(bootTimeExceeded);
const mockListRunners = vi.mocked(listEC2Runners);
const mockCreateRunners = vi.mocked(createRunners);
const mockLoadProviderConfig = vi.mocked(loadEc2ProviderConfig);

describe('calculateEc2PoolSize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts registered online idle runners', () => {
    const runners: RunnerInfo[] = [{ id: 'i-idle', owner: 'owner', type: 'Org' }];
    const runnerStatus = new Map([['i-idle', { busy: false, status: 'online' }]]);

    expect(calculateEc2PoolSize(runners, runnerStatus)).toBe(1);
    expect(mockBootTimeExceeded).not.toHaveBeenCalled();
  });

  it('does not count registered busy or offline runners', () => {
    const runners: RunnerInfo[] = [
      { id: 'i-busy', owner: 'owner', type: 'Org' },
      { id: 'i-offline', owner: 'owner', type: 'Org' },
    ];
    const runnerStatus = new Map([
      ['i-busy', { busy: true, status: 'online' }],
      ['i-offline', { busy: false, status: 'offline' }],
    ]);

    expect(calculateEc2PoolSize(runners, runnerStatus)).toBe(0);
    expect(mockBootTimeExceeded).not.toHaveBeenCalled();
  });

  it('counts registered busy runners when busy runners are included', () => {
    const runners: RunnerInfo[] = [{ id: 'i-busy', owner: 'owner', type: 'Org' }];
    const runnerStatus = new Map([['i-busy', { busy: true, status: 'online' }]]);

    expect(calculateEc2PoolSize(runners, runnerStatus, true)).toBe(1);
    expect(mockBootTimeExceeded).not.toHaveBeenCalled();
  });

  it('counts unregistered runners that are still booting', () => {
    const runners: RunnerInfo[] = [{ id: 'i-booting', owner: 'owner', type: 'Org' }];
    mockBootTimeExceeded.mockReturnValue(false);

    expect(calculateEc2PoolSize(runners, new Map())).toBe(1);
  });

  it('does not count unregistered runners whose boot time expired', () => {
    const runners: RunnerInfo[] = [{ id: 'i-expired', owner: 'owner', type: 'Org' }];
    mockBootTimeExceeded.mockReturnValue(true);

    expect(calculateEc2PoolSize(runners, new Map())).toBe(0);
  });
});

describe('createEc2PoolProvider', () => {
  const createStartRunnerConfig = vi.fn<CreateStartRunnerConfig>();
  const githubInstallationClient = {} as Octokit;
  const githubRunnerConfig: CreateGitHubRunnerConfig = {
    ephemeral: true,
    enableJitConfig: true,
    runnerLabels: 'self-hosted',
    runnerGroup: 'default',
    runnerNamePrefix: '',
    runnerOwner: 'owner',
    runnerType: 'Org',
    disableAutoUpdate: false,
    ssmTokenPath: '/runners/tokens',
    ssmConfigPath: '/runners/config',
    ssmParameterStoreTags: [],
  };
  const providerConfig: Ec2ProviderConfig = {
    environment: 'test-environment',
    subnets: ['subnet-123'],
    launchTemplateName: 'runner-template',
    ec2instanceCriteria: {
      instanceTypes: ['m5.large'],
      targetCapacityType: 'spot',
      instanceAllocationStrategy: 'lowest-price',
    },
    tracingEnabled: false,
    onDemandFailoverOnError: [],
    scaleErrors: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadProviderConfig.mockReturnValue(providerConfig);
  });

  it('lists only running instances managed for the requested pool', async () => {
    const runners: RunnerInfo[] = [{ id: 'i-running', owner: 'owner', type: 'Org' }];
    mockListRunners.mockResolvedValue(runners);
    const provider = createEc2PoolProvider(createStartRunnerConfig);

    await expect(
      provider.listRunners({
        environment: 'test-environment',
        runnerOwner: 'owner',
        runnerType: 'Org',
      }),
    ).resolves.toBe(runners);
    expect(mockListRunners).toHaveBeenCalledWith({
      environment: 'test-environment',
      runnerOwner: 'owner',
      runnerType: 'Org',
      statuses: ['running'],
    });
  });

  it('creates pool runners with the pool source and returns their instance IDs', async () => {
    mockCreateRunners.mockResolvedValue({
      instances: ['i-created'],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 0,
    });
    const provider = createEc2PoolProvider(createStartRunnerConfig);

    await expect(
      provider.createRunners({
        githubRunnerConfig,
        numberOfRunners: 1,
        githubInstallationClient,
      }),
    ).resolves.toEqual(['i-created']);
    expect(mockCreateRunners).toHaveBeenCalledWith(
      githubRunnerConfig,
      providerConfig,
      1,
      githubInstallationClient,
      createStartRunnerConfig,
      'pool-lambda',
    );
  });
});

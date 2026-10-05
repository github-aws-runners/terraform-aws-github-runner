import type { Octokit } from '@octokit/rest';
import type { CreateGitHubRunnerConfig, CreateStartRunnerConfig, RunnerInfo } from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations } from '../runners';
import type { Ec2StandbyOperations } from '../standby';
import { createEc2PoolCapability } from './pool';
import { createRunners, type Ec2ProviderConfig, loadEc2ProviderConfig } from './runner-creation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../runners', () => ({
  bootTimeExceeded: vi.fn(),
}));

vi.mock('./runner-creation', () => ({
  createRunners: vi.fn(),
  loadEc2ProviderConfig: vi.fn(),
}));

const mockBootTimeExceeded = vi.mocked(bootTimeExceeded);
const mockCreateRunners = vi.mocked(createRunners);
const mockLoadProviderConfig = vi.mocked(loadEc2ProviderConfig);

const ec2Operations = {
  list: vi.fn<Ec2RunnerResourceOperations['list']>(),
  create: vi.fn<Ec2RunnerResourceOperations['create']>(),
  terminate: vi.fn<Ec2RunnerResourceOperations['terminate']>(),
  tag: vi.fn<Ec2RunnerResourceOperations['tag']>(),
  untag: vi.fn<Ec2RunnerResourceOperations['untag']>(),
} satisfies Ec2RunnerResourceOperations;
const createStartRunnerConfig = vi.fn<CreateStartRunnerConfig>();
const capability = createEc2PoolCapability(ec2Operations, createStartRunnerConfig);

describe('createEc2PoolCapability.countAvailableRunners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts registered online idle runners', () => {
    const runners: RunnerInfo[] = [{ id: 'i-idle', owner: 'owner', type: 'Org' }];
    const runnerStatus = new Map([['i-idle', { busy: false, status: 'online' }]]);

    expect(capability.countAvailableRunners(runners, runnerStatus)).toBe(1);
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

    expect(capability.countAvailableRunners(runners, runnerStatus)).toBe(0);
    expect(mockBootTimeExceeded).not.toHaveBeenCalled();
  });

  it('counts registered busy runners when busy runners are included', () => {
    const runners: RunnerInfo[] = [{ id: 'i-busy', owner: 'owner', type: 'Org' }];
    const runnerStatus = new Map([['i-busy', { busy: true, status: 'online' }]]);

    expect(capability.countAvailableRunners(runners, runnerStatus, true)).toBe(1);
    expect(mockBootTimeExceeded).not.toHaveBeenCalled();
  });

  it('counts unregistered runners that are still booting', () => {
    const runners: RunnerInfo[] = [{ id: 'i-booting', owner: 'owner', type: 'Org' }];
    mockBootTimeExceeded.mockReturnValue(false);

    expect(capability.countAvailableRunners(runners, new Map())).toBe(1);
  });

  it('does not count unregistered runners whose boot time expired', () => {
    const runners: RunnerInfo[] = [{ id: 'i-expired', owner: 'owner', type: 'Org' }];
    mockBootTimeExceeded.mockReturnValue(true);

    expect(capability.countAvailableRunners(runners, new Map())).toBe(0);
  });
});

describe('createEc2PoolCapability.listRunners', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists only running instances managed for the requested pool', async () => {
    const runners: RunnerInfo[] = [{ id: 'i-running', owner: 'owner', type: 'Org' }];
    ec2Operations.list.mockResolvedValue(runners);

    await expect(
      capability.listRunners({
        environment: 'test-environment',
        runnerOwner: 'owner',
        runnerType: 'Org',
      }),
    ).resolves.toBe(runners);
    expect(ec2Operations.list).toHaveBeenCalledWith({
      environment: 'test-environment',
      runnerOwner: 'owner',
      runnerType: 'Org',
      statuses: ['running'],
    });
  });
});

describe('createEc2PoolCapability.createRunners', () => {
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

  it('creates pool runners with the pool source and returns their instance IDs', async () => {
    mockCreateRunners.mockResolvedValue({
      instances: ['i-created'],
      retryableErrorCount: 0,
      nonRetryableErrorCount: 0,
    });

    await expect(
      capability.createRunners({
        githubRunnerConfig,
        numberOfRunners: 1,
        githubInstallationClient,
      }),
    ).resolves.toEqual(['i-created']);
    expect(mockCreateRunners).toHaveBeenCalledWith(
      ec2Operations,
      githubRunnerConfig,
      providerConfig,
      1,
      githubInstallationClient,
      createStartRunnerConfig,
      'pool-lambda',
      undefined,
    );
  });
});

describe('createEc2PoolCapability.standby', () => {
  const standbyOperations = {
    destroyInstance: vi.fn<Ec2StandbyOperations['destroyInstance']>(),
    launchWarm: vi.fn<Ec2StandbyOperations['launchWarm']>(),
    listStandby: vi.fn<Ec2StandbyOperations['listStandby']>(),
    listStoppedWarmInstances: vi.fn<Ec2StandbyOperations['listStoppedWarmInstances']>(),
    startInstance: vi.fn<Ec2StandbyOperations['startInstance']>(),
    cancelSpotRequest: vi.fn<Ec2StandbyOperations['cancelSpotRequest']>(),
    currentImage: vi.fn<Ec2StandbyOperations['currentImage']>(),
  } satisfies Ec2StandbyOperations;
  const standby = createEc2PoolCapability(ec2Operations, createStartRunnerConfig, standbyOperations).standby!;
  const poolInput = { environment: 'test-environment', runnerOwner: 'owner', runnerType: 'Org' as const };
  const providerConfig: Ec2ProviderConfig = {
    environment: 'config-environment',
    subnets: ['subnet-a', 'subnet-b'],
    launchTemplateName: 'runner-template',
    ec2instanceCriteria: {
      instanceTypes: ['m5.large', 'c5.large'],
      targetCapacityType: 'spot',
      instanceAllocationStrategy: 'lowest-price',
    },
    amiIdSsmParameterName: '/ami',
    tracingEnabled: true,
    onDemandFailoverOnError: [],
    scaleErrors: ['InsufficientInstanceCapacity'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadProviderConfig.mockReturnValue(providerConfig);
  });

  it('is undefined when the capability has no standby operations', () => {
    expect(capability.standby).toBeUndefined();
  });

  it('lists standby instances with spot request state for the pool', async () => {
    const listing = {
      instances: [{ instanceId: 'i-warm', state: 'WARM' as const }],
      orphanedSpotRequests: [{ spotInstanceRequestId: 'sir-1', state: 'open' }],
      spotStateKnown: true,
    };
    standbyOperations.listStandby.mockResolvedValue(listing);

    await expect(standby.list(poolInput)).resolves.toEqual(listing);
    expect(standbyOperations.listStandby).toHaveBeenCalledWith(poolInput, { spotRequests: true });
  });

  it('launches warm instances from the provider config and maps retryable failures', async () => {
    standbyOperations.launchWarm.mockResolvedValue({
      instances: ['i-1'],
      failedInstanceCount: 1,
      failureCodes: ['aws-name:InsufficientInstanceCapacity'],
    });

    await expect(standby.launch({ ...poolInput, numberOfInstances: 2, maxAgeHours: 12 })).resolves.toEqual({
      instances: ['i-1'],
      retryableErrorCount: 1,
      nonRetryableErrorCount: 0,
    });
    expect(standbyOperations.launchWarm).toHaveBeenCalledWith({
      ...poolInput,
      subnets: providerConfig.subnets,
      launchTemplateName: providerConfig.launchTemplateName,
      ec2instanceCriteria: providerConfig.ec2instanceCriteria,
      amiIdSsmParameterName: '/ami',
      tracingEnabled: true,
      numberOfRunners: 2,
      source: 'pool-lambda',
      maxAgeHours: 12,
    });
  });

  it('destroys every instance and reports failures without stopping', async () => {
    standbyOperations.destroyInstance.mockRejectedValueOnce(new Error('boom')).mockResolvedValue();

    await expect(
      standby.destroy([{ instanceId: 'i-1', spotInstanceRequestId: 'sir-1' }, { instanceId: 'i-2' }]),
    ).resolves.toEqual({ succeeded: ['i-2'], failed: ['i-1'] });
    expect(standbyOperations.destroyInstance).toHaveBeenNthCalledWith(1, {
      instanceId: 'i-1',
      spotInstanceRequestId: 'sir-1',
    });
    expect(standbyOperations.destroyInstance).toHaveBeenNthCalledWith(2, { instanceId: 'i-2' });
  });

  it('cancels every spot request and reports failures without stopping', async () => {
    standbyOperations.cancelSpotRequest.mockResolvedValueOnce().mockRejectedValueOnce(new Error('boom'));

    await expect(
      standby.cancelSpotRequests!([{ spotInstanceRequestId: 'sir-1' }, { spotInstanceRequestId: 'sir-2' }]),
    ).resolves.toEqual({ succeeded: ['sir-1'], failed: ['sir-2'] });
  });

  it('destroys the replacement instance of a respawned request, cancelling the request first', async () => {
    standbyOperations.destroyInstance.mockResolvedValue();

    await expect(
      standby.cancelSpotRequests!([
        { spotInstanceRequestId: 'sir-1', instanceId: 'i-gone', replacementInstanceId: 'i-respawn' },
      ]),
    ).resolves.toEqual({ succeeded: ['sir-1'], failed: [] });
    expect(standbyOperations.destroyInstance).toHaveBeenCalledWith({
      instanceId: 'i-respawn',
      spotInstanceRequestId: 'sir-1',
    });
    expect(standbyOperations.cancelSpotRequest).not.toHaveBeenCalled();
  });

  it('resolves the current image from the provider config', async () => {
    standbyOperations.currentImage.mockResolvedValue({ imageId: 'ami-1', launchTemplateVersion: '3' });

    await expect(standby.currentImage!()).resolves.toEqual({ imageId: 'ami-1', launchTemplateVersion: '3' });
    expect(standbyOperations.currentImage).toHaveBeenCalledWith({
      launchTemplateName: 'runner-template',
      amiIdSsmParameterName: '/ami',
    });
  });
});

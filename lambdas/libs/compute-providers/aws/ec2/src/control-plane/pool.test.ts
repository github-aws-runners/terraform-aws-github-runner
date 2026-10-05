import type { Octokit } from '@octokit/rest';
import type {
  CreateGitHubRunnerConfig,
  CreateStartRunnerConfig,
  PoolStandbyOperations,
  RunnerInfo,
} from '../../../../core';
import { bootTimeExceeded, type Ec2RunnerResourceOperations } from '../runners';
import type { Ec2StandbyOperations } from '../standby';
import type { WarmIndexStore } from '../warm-index';
import { createEc2PoolCapability, type CreateWarmIndexStore, WARM_POOL_RECONCILE_INTERVAL_SECONDS } from './pool';
import { createRunners, type Ec2ProviderConfig, loadEc2ProviderConfig } from './runner-creation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../runners', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runners')>()),
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
    readStandby: vi.fn<Ec2StandbyOperations['readStandby']>(),
    listStoppedWarmInstances: vi.fn<Ec2StandbyOperations['listStoppedWarmInstances']>(),
    listScaleDownInstances: vi.fn<Ec2StandbyOperations['listScaleDownInstances']>(),
    startInstance: vi.fn<Ec2StandbyOperations['startInstance']>(),
    cancelSpotRequest: vi.fn<Ec2StandbyOperations['cancelSpotRequest']>(),
    currentImage: vi.fn<Ec2StandbyOperations['currentImage']>(),
  } satisfies Ec2StandbyOperations;
  const index = {
    query: vi.fn<WarmIndexStore['query']>(),
    update: vi.fn<WarmIndexStore['update']>(),
    remove: vi.fn<WarmIndexStore['remove']>(),
    removeUnclaimed: vi.fn<WarmIndexStore['removeUnclaimed']>(),
    claim: vi.fn<WarmIndexStore['claim']>(),
    release: vi.fn<WarmIndexStore['release']>(),
    markActivated: vi.fn<WarmIndexStore['markActivated']>(),
    markUnusable: vi.fn<WarmIndexStore['markUnusable']>(),
    releaseWithCooldown: vi.fn<WarmIndexStore['releaseWithCooldown']>(),
    claimReconcile: vi.fn<WarmIndexStore['claimReconcile']>(),
  } satisfies WarmIndexStore;
  const createIndexStore = vi.fn<CreateWarmIndexStore>(() => index);
  let standby: PoolStandbyOperations;
  const poolInput = { environment: 'test-environment', runnerOwner: 'test-environment', runnerType: 'Org' as const };
  const emptyRead = { instances: [], orphanedSpotRequests: [], spotStateKnown: true, releasedInstanceIds: [] };
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
    for (const fn of [...Object.values(index), ...Object.values(standbyOperations)]) fn.mockReset();
    process.env.WARM_POOL_INDEX_TABLE_NAME = 'warm-index';
    process.env.ENVIRONMENT = 'test-environment';
    standby = createEc2PoolCapability(ec2Operations, createStartRunnerConfig, {
      standbyOperations,
      createIndexStore,
    }).standby!;
    index.query.mockResolvedValue([]);
    index.claimReconcile.mockResolvedValue(false);
    index.removeUnclaimed.mockResolvedValue(true);
    standbyOperations.readStandby.mockResolvedValue(emptyRead);
  });

  it('is undefined when the capability has no standby operations', () => {
    expect(capability.standby).toBeUndefined();
  });

  it('fails the listing when the index table is not configured', async () => {
    delete process.env.WARM_POOL_INDEX_TABLE_NAME;

    await expect(standby.list(poolInput)).rejects.toThrow('WARM_POOL_INDEX_TABLE_NAME is not set.');
  });

  it('reads the indexed instances by ID and writes changed EC2 state back', async () => {
    const launchTime = new Date('2026-09-30T10:00:00.000Z');
    index.query.mockResolvedValue([
      { instanceId: 'i-primed', state: 'PRIMING', spotInstanceRequestId: 'sir-1' },
      { instanceId: 'i-same', state: 'WARM', launchTime: launchTime.toISOString(), expiresAt: 'later' },
      { instanceId: 'i-active', state: 'ACTIVATED', activatedAt: 'then' },
      { instanceId: 'i-gone', state: 'WARM' },
    ]);
    standbyOperations.readStandby.mockResolvedValue({
      instances: [
        { instanceId: 'i-primed', state: 'WARM', launchTime, expiresAt: 'later', spotInstanceRequestId: 'sir-1' },
        { instanceId: 'i-same', state: 'WARM', launchTime, expiresAt: 'later' },
      ],
      orphanedSpotRequests: [{ spotInstanceRequestId: 'sir-9', instanceId: 'i-orphan' }],
      spotStateKnown: true,
      releasedInstanceIds: ['i-gone'],
    });

    await expect(standby.list(poolInput)).resolves.toEqual({
      instances: [
        expect.objectContaining({ instanceId: 'i-primed', state: 'WARM' }),
        expect.objectContaining({ instanceId: 'i-same' }),
      ],
      orphanedSpotRequests: [{ spotInstanceRequestId: 'sir-9', instanceId: 'i-orphan' }],
      spotStateKnown: true,
    });
    expect(createIndexStore).toHaveBeenCalledWith('warm-index', 'test-environment');
    expect(standbyOperations.readStandby).toHaveBeenCalledWith([
      { instanceId: 'i-primed', spotInstanceRequestId: 'sir-1', activatedAt: undefined },
      { instanceId: 'i-same', spotInstanceRequestId: undefined, activatedAt: undefined },
      { instanceId: 'i-active', spotInstanceRequestId: undefined, activatedAt: 'then' },
      { instanceId: 'i-gone', spotInstanceRequestId: undefined, activatedAt: undefined },
    ]);
    expect(index.update).toHaveBeenCalledTimes(1);
    expect(index.update).toHaveBeenCalledWith({
      instanceId: 'i-primed',
      state: 'WARM',
      launchTime: launchTime.toISOString(),
      expiresAt: 'later',
      spotInstanceRequestId: 'sir-1',
    });
    expect(index.remove).toHaveBeenCalledWith('i-gone');
    expect(standbyOperations.listStandby).not.toHaveBeenCalled();
  });

  it('records the instance type and AZ, and reports failed starts to the pool', async () => {
    index.query.mockResolvedValue([{ instanceId: 'i-warm', state: 'WARM', startFailures: 2 }]);
    standbyOperations.readStandby.mockResolvedValue({
      ...emptyRead,
      instances: [{ instanceId: 'i-warm', state: 'WARM', instanceType: 'm7g.large', availabilityZone: 'eu-west-1a' }],
    });

    await expect(standby.list(poolInput)).resolves.toEqual(
      expect.objectContaining({
        instances: [expect.objectContaining({ instanceId: 'i-warm', startFailures: 2 })],
      }),
    );
    expect(index.update).toHaveBeenCalledWith({
      instanceId: 'i-warm',
      state: 'WARM',
      instanceType: 'm7g.large',
      availabilityZone: 'eu-west-1a',
    });
  });

  it('keeps listing when an index write fails', async () => {
    index.query.mockResolvedValue([{ instanceId: 'i-gone', state: 'WARM' }]);
    standbyOperations.readStandby.mockResolvedValue({ ...emptyRead, releasedInstanceIds: ['i-gone'] });
    index.remove.mockRejectedValue(new Error('throttled'));

    await expect(standby.list(poolInput)).resolves.toEqual({
      instances: [],
      orphanedSpotRequests: [],
      spotStateKnown: true,
    });
  });

  it('adopts untracked warm-pool instances once per reconcile interval', async () => {
    index.query.mockResolvedValue([{ instanceId: 'i-known', state: 'WARM' }]);
    index.claimReconcile.mockResolvedValue(true);
    standbyOperations.listStandby.mockResolvedValue([
      { instanceId: 'i-known', state: 'WARM' },
      { instanceId: 'i-untracked', state: 'WARM', spotInstanceRequestId: 'sir-2' },
      { instanceId: 'i-activated', state: 'ACTIVE' },
    ]);

    await standby.list(poolInput);

    expect(index.claimReconcile).toHaveBeenCalledWith(WARM_POOL_RECONCILE_INTERVAL_SECONDS);
    expect(WARM_POOL_RECONCILE_INTERVAL_SECONDS).toBe(3600);
    expect(standbyOperations.listStandby).toHaveBeenCalledWith(poolInput);
    expect(index.update).toHaveBeenCalledWith(
      expect.objectContaining({ instanceId: 'i-untracked', state: 'WARM', spotInstanceRequestId: 'sir-2' }),
    );
    expect(standbyOperations.readStandby).toHaveBeenCalledWith([
      expect.objectContaining({ instanceId: 'i-known' }),
      expect.objectContaining({ instanceId: 'i-untracked' }),
    ]);
  });

  it('launches warm instances from the provider config, indexes them and maps retryable failures', async () => {
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
    expect(index.update).toHaveBeenCalledWith({ instanceId: 'i-1', state: 'PRIMING' });
  });

  it('still reports launched instances when indexing them fails', async () => {
    standbyOperations.launchWarm.mockResolvedValue({ instances: ['i-1'], failedInstanceCount: 0, failureCodes: [] });
    index.update.mockRejectedValue(new Error('throttled'));

    await expect(standby.launch({ ...poolInput, numberOfInstances: 1, maxAgeHours: 12 })).resolves.toEqual(
      expect.objectContaining({ instances: ['i-1'] }),
    );
  });

  it('destroys unclaimed instances and reports failures without stopping', async () => {
    standbyOperations.destroyInstance.mockRejectedValueOnce(new Error('boom')).mockResolvedValue();

    await expect(
      standby.destroy([{ instanceId: 'i-1', spotInstanceRequestId: 'sir-1' }, { instanceId: 'i-2' }]),
    ).resolves.toEqual({ succeeded: ['i-2'], failed: ['i-1'] });
    expect(index.removeUnclaimed).toHaveBeenCalledWith('i-1');
    expect(standbyOperations.destroyInstance).toHaveBeenNthCalledWith(1, {
      instanceId: 'i-1',
      spotInstanceRequestId: 'sir-1',
    });
    expect(standbyOperations.destroyInstance).toHaveBeenNthCalledWith(2, { instanceId: 'i-2' });
  });

  it('does not destroy an instance scale-up has claimed', async () => {
    index.removeUnclaimed.mockResolvedValue(false);

    await expect(standby.destroy([{ instanceId: 'i-claimed' }])).resolves.toEqual({
      succeeded: [],
      failed: ['i-claimed'],
    });
    expect(standbyOperations.destroyInstance).not.toHaveBeenCalled();
  });

  it('cancels every spot request, drops the index entry and reports failures without stopping', async () => {
    standbyOperations.cancelSpotRequest.mockResolvedValueOnce().mockRejectedValueOnce(new Error('boom'));

    await expect(
      standby.cancelSpotRequests!([
        { spotInstanceRequestId: 'sir-1', instanceId: 'i-1' },
        { spotInstanceRequestId: 'sir-2', instanceId: 'i-2' },
      ]),
    ).resolves.toEqual({ succeeded: ['sir-1'], failed: ['sir-2'] });
    expect(index.remove).toHaveBeenCalledTimes(1);
    expect(index.remove).toHaveBeenCalledWith('i-1');
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
    expect(index.remove).toHaveBeenCalledWith('i-gone');
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

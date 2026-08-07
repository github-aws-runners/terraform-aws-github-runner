import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateGitHubRunnerConfig, CreateStartRunnerConfig } from '../../../../core';
import { loadMicrovmProviderConfig } from './config';
import { isRetryableMicrovmError, runMicrovmRunner, tagMicrovm, terminateMicrovm } from './microvms';
import { createMicrovmRunHookPayload, createMicrovmRunners } from './runner-config';

vi.mock('./config', () => ({ loadMicrovmProviderConfig: vi.fn() }));
vi.mock('./microvms', () => ({
  isRetryableMicrovmError: vi.fn(),
  runMicrovmRunner: vi.fn(),
  tagMicrovm: vi.fn(),
  terminateMicrovm: vi.fn(),
}));

const imageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner';
const githubClient = {} as Octokit;
const createStartRunnerConfig = vi.fn<CreateStartRunnerConfig>();

function runnerConfig(overrides: Partial<CreateGitHubRunnerConfig> = {}): CreateGitHubRunnerConfig {
  return {
    ephemeral: true,
    enableJitConfig: true,
    runnerLabels: 'self-hosted,linux,arm64,microvm',
    runnerGroup: 'Default',
    runnerNamePrefix: 'unit-test-',
    runnerOwner: 'Codertocat',
    runnerType: 'Org',
    disableAutoUpdate: true,
    ssmTokenPath: '/github-action-runners/unit-test/token',
    ssmConfigPath: '/github-action-runners/unit-test/config',
    ssmParameterStoreTags: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENVIRONMENT = 'unit-test';
  vi.mocked(loadMicrovmProviderConfig).mockReturnValue({
    imageIdentifier: imageArn,
    executionRoleArn: 'arn:aws:iam::123456789012:role/microvm-runner',
    maximumDurationInSeconds: 1200,
  });
  vi.mocked(runMicrovmRunner).mockResolvedValue('mvm-1');
  vi.mocked(tagMicrovm).mockResolvedValue();
  vi.mocked(terminateMicrovm).mockResolvedValue();
  vi.mocked(isRetryableMicrovmError).mockReturnValue(false);
  createStartRunnerConfig.mockResolvedValue([]);
});

describe('createMicrovmRunHookPayload', () => {
  it('contains only the versioned SSM prefix contract', () => {
    expect(JSON.parse(createMicrovmRunHookPayload('/runner/token'))).toEqual({
      version: 1,
      runnerConfigSsmPath: '/runner/token',
    });
  });
});

describe('createMicrovmRunners', () => {
  it.each([{ ephemeral: false }, { enableJitConfig: false }])(
    'rejects unsupported runner configuration %j',
    async (overrides) => {
      await expect(
        createMicrovmRunners(runnerConfig(overrides), 2, githubClient, createStartRunnerConfig, 'scale-up-lambda'),
      ).resolves.toEqual({ instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 2 });

      expect(runMicrovmRunner).not.toHaveBeenCalled();
    },
  );

  it('requires an SSM token path', async () => {
    await expect(
      createMicrovmRunners(
        runnerConfig({ ssmTokenPath: '' }),
        1,
        githubClient,
        createStartRunnerConfig,
        'scale-up-lambda',
      ),
    ).resolves.toEqual({ instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 1 });
  });

  it('classifies invalid provider configuration as non-retryable', async () => {
    vi.mocked(loadMicrovmProviderConfig).mockImplementation(() => {
      throw new Error('missing image');
    });

    await expect(
      createMicrovmRunners(runnerConfig(), 3, githubClient, createStartRunnerConfig, 'scale-up-lambda'),
    ).resolves.toEqual({ instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 3 });
  });

  it('launches each MicroVM and delivers its JIT configuration', async () => {
    vi.mocked(runMicrovmRunner).mockResolvedValueOnce('mvm-1').mockResolvedValueOnce('mvm-2');
    createStartRunnerConfig.mockImplementation(async (_config, runnerIds, _client, options) => {
      await options?.onJitConfigCreated?.(runnerIds[0], { githubRunnerId: `github-${runnerIds[0]}`, runnerLabels: [] });
      return [];
    });

    await expect(
      createMicrovmRunners(runnerConfig(), 2, githubClient, createStartRunnerConfig, 'pool-lambda'),
    ).resolves.toEqual({ instances: ['mvm-1', 'mvm-2'], retryableErrorCount: 0, nonRetryableErrorCount: 0 });

    expect(runMicrovmRunner).toHaveBeenNthCalledWith(1, {
      config: expect.objectContaining({ imageIdentifier: imageArn }),
      environment: 'unit-test',
      runHookPayload: createMicrovmRunHookPayload('/github-action-runners/unit-test/token'),
      runnerOwner: 'Codertocat',
      runnerType: 'Org',
      source: 'pool-lambda',
    });
    expect(createStartRunnerConfig).toHaveBeenCalledTimes(2);
    const options = createStartRunnerConfig.mock.calls[0][3];
    expect(options?.getSsmParameterTags?.('mvm-1')).toEqual([{ Key: 'MicrovmId', Value: 'mvm-1' }]);
    expect(tagMicrovm).toHaveBeenNthCalledWith(1, imageArn, 'mvm-1', {
      'ghr:github_runner_id': 'github-mvm-1',
    });
  });

  it('applies dynamic labels to the RunMicrovm configuration and metadata tags', async () => {
    const overrideImageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-large';
    const overrideEgressConnectorArn =
      'arn:aws:lambda:eu-west-1:123456789012:network-connector:github-runner-private-egress';
    createStartRunnerConfig.mockImplementation(async (_config, runnerIds, _client, options) => {
      await options?.onJitConfigCreated?.(runnerIds[0], { githubRunnerId: 'github-mvm-1', runnerLabels: [] });
      return [];
    });

    await createMicrovmRunners(runnerConfig(), 1, githubClient, createStartRunnerConfig, 'scale-up-lambda', {
      egressNetworkConnectors: [overrideEgressConnectorArn],
      imageIdentifier: overrideImageArn,
      imageVersion: '3.0',
      maximumDurationInSeconds: 7200,
    });

    expect(runMicrovmRunner).toHaveBeenCalledWith({
      config: {
        egressNetworkConnectors: [overrideEgressConnectorArn],
        imageIdentifier: overrideImageArn,
        imageVersion: '3.0',
        executionRoleArn: 'arn:aws:iam::123456789012:role/microvm-runner',
        maximumDurationInSeconds: 7200,
      },
      environment: 'unit-test',
      runHookPayload: createMicrovmRunHookPayload('/github-action-runners/unit-test/token'),
      runnerOwner: 'Codertocat',
      runnerType: 'Org',
      source: 'scale-up-lambda',
    });
    expect(tagMicrovm).toHaveBeenCalledWith(overrideImageArn, 'mvm-1', {
      'ghr:github_runner_id': 'github-mvm-1',
    });
  });

  it('retries a JIT setup failure even when runner cleanup fails', async () => {
    createStartRunnerConfig.mockResolvedValue(['mvm-1']);
    vi.mocked(terminateMicrovm).mockRejectedValue(new Error('cleanup failed'));

    await expect(
      createMicrovmRunners(runnerConfig(), 1, githubClient, createStartRunnerConfig, 'scale-up-lambda'),
    ).resolves.toEqual({ instances: [], retryableErrorCount: 1, nonRetryableErrorCount: 0 });

    expect(terminateMicrovm).toHaveBeenCalledWith('mvm-1');
  });

  it.each([
    [true, { instances: [], retryableErrorCount: 1, nonRetryableErrorCount: 0 }],
    [false, { instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 1 }],
  ])('classifies launch failures with retryable=%s', async (retryable, expected) => {
    vi.mocked(runMicrovmRunner).mockRejectedValue(new Error('launch failed'));
    vi.mocked(isRetryableMicrovmError).mockReturnValue(retryable);

    await expect(
      createMicrovmRunners(runnerConfig(), 1, githubClient, createStartRunnerConfig, 'scale-up-lambda'),
    ).resolves.toEqual(expected);
  });

  it('attempts cleanup when setup throws after launch', async () => {
    createStartRunnerConfig.mockRejectedValue(new Error('JIT setup failed'));
    vi.mocked(terminateMicrovm).mockRejectedValue(new Error('cleanup failed'));

    await expect(
      createMicrovmRunners(runnerConfig(), 1, githubClient, createStartRunnerConfig, 'scale-up-lambda'),
    ).resolves.toEqual({ instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 1 });

    expect(terminateMicrovm).toHaveBeenCalledWith('mvm-1');
  });
});

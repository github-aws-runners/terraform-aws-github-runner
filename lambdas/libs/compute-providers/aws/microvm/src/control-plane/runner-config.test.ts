import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateGitHubRunnerConfig, CreateStartRunnerConfig } from '../../../../core';
import { loadMicrovmProviderConfig } from './config';
import { isRetryableMicrovmError, runMicrovmRunner, terminateMicrovm } from './microvms';
import { createMicrovmRunHookPayload, createMicrovmRunners } from './runner-config';
import { setMicrovmGithubRunnerMetadata } from './runner-metadata';

vi.mock('./config', () => ({ loadMicrovmProviderConfig: vi.fn() }));
vi.mock('./microvms', () => ({
  isRetryableMicrovmError: vi.fn(),
  runMicrovmRunner: vi.fn(),
  terminateMicrovm: vi.fn(),
}));
vi.mock('./runner-metadata', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./runner-metadata')>()),
  setMicrovmGithubRunnerMetadata: vi.fn(),
}));

const imageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner';
const metadataSsmPath = '/github-action-runners/unit-test/microvm-metadata';
const runnerConfigSsmPath = '/github-action-runners/unit-test/config';
const runnerTokenSsmPath = '/github-action-runners/unit-test/token';
const githubClient = {} as Octokit;
const createStartRunnerConfig = vi.fn<CreateStartRunnerConfig>();
const ssmParameterStoreTags = [
  { Key: 'CostCenter', Value: '1234' },
  { Key: 'Name', Value: 'not-used-for-microvm-metadata' },
  { Key: 'ghr:environment', Value: 'caller-cannot-override' },
  { Key: 'ghr:runner_name_prefix', Value: 'caller-cannot-override' },
  { Key: 'ghr:ssm_config_path', Value: 'caller-cannot-override' },
];
const microvmMetadataTags = [
  { Key: 'CostCenter', Value: '1234' },
  { Key: 'ghr:environment', Value: 'unit-test' },
  { Key: 'ghr:runner_name_prefix', Value: 'unit-test-' },
  { Key: 'ghr:ssm_config_path', Value: runnerConfigSsmPath },
];
const canonicalMetadataTags = [
  ...microvmMetadataTags,
  { Key: 'ghr:Application', Value: 'github-action-runner' },
  { Key: 'ghr:microvm_id', Value: 'mvm-1' },
];
const providerConfig = {
  imageIdentifier: imageArn,
  imageVersion: '2.0',
  executionRoleArn: 'arn:aws:iam::123456789012:role/microvm-runner',
  metadataSsmPath,
  runnerTokenSsmPath,
};

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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENVIRONMENT = 'unit-test';
  process.env.SSM_CONFIG_PATH = runnerConfigSsmPath;
  process.env.SSM_PARAMETER_STORE_TAGS = JSON.stringify(ssmParameterStoreTags);
  process.env.SSM_TOKEN_PATH = runnerTokenSsmPath;
  vi.mocked(loadMicrovmProviderConfig).mockReturnValue(providerConfig);
  vi.mocked(runMicrovmRunner).mockResolvedValue({ microvmId: 'mvm-1', metadataTags: canonicalMetadataTags });
  vi.mocked(setMicrovmGithubRunnerMetadata).mockResolvedValue();
  vi.mocked(terminateMicrovm).mockResolvedValue();
  vi.mocked(isRetryableMicrovmError).mockReturnValue(false);
  createStartRunnerConfig.mockResolvedValue([]);
});

describe('createMicrovmRunHookPayload', () => {
  it('contains the image and versioned runner paths', () => {
    expect(
      JSON.parse(
        createMicrovmRunHookPayload({
          imageArn,
          imageVersion: '2.0',
          runnerConfigSsmPath,
          runnerTokenSsmPath: '/runner/token',
        }),
      ),
    ).toEqual({
      imageArn,
      imageVersion: '2.0',
      version: 1,
      runnerConfigSsmPath,
      runnerTokenSsmPath: '/runner/token',
    });
  });

  it('requires the image ARN and version to be provided together', () => {
    expect(() =>
      createMicrovmRunHookPayload({
        imageArn,
        runnerConfigSsmPath,
        runnerTokenSsmPath,
      }),
    ).toThrow('MicroVM hook payload image ARN and version must be provided together');
  });

  it('omits image metadata when no explicit image version is selected', () => {
    expect(JSON.parse(createMicrovmRunHookPayload({ runnerConfigSsmPath, runnerTokenSsmPath }))).toEqual({
      version: 1,
      runnerConfigSsmPath,
      runnerTokenSsmPath,
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
    process.env.SSM_TOKEN_PATH = '';
    await expect(
      createMicrovmRunners(runnerConfig(), 1, githubClient, createStartRunnerConfig, 'scale-up-lambda'),
    ).resolves.toEqual({ instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 1 });

    expect(runMicrovmRunner).not.toHaveBeenCalled();
  });

  it('requires an SSM config path', async () => {
    process.env.SSM_CONFIG_PATH = '';
    await expect(
      createMicrovmRunners(runnerConfig(), 1, githubClient, createStartRunnerConfig, 'scale-up-lambda'),
    ).resolves.toEqual({ instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 1 });

    expect(runMicrovmRunner).not.toHaveBeenCalled();
  });

  it('rejects a metadata path that overlaps the JIT token path', async () => {
    vi.mocked(loadMicrovmProviderConfig).mockReturnValue({
      imageIdentifier: imageArn,
      executionRoleArn: 'arn:aws:iam::123456789012:role/microvm-runner',
      metadataSsmPath: '/github-action-runners/unit-test/token/metadata',
      runnerTokenSsmPath,
    });

    await expect(
      createMicrovmRunners(runnerConfig(), 1, githubClient, createStartRunnerConfig, 'scale-up-lambda'),
    ).resolves.toEqual({ instances: [], retryableErrorCount: 0, nonRetryableErrorCount: 1 });
    expect(runMicrovmRunner).not.toHaveBeenCalled();
  });

  it('canonicalizes the configuration and token paths before launching or writing JIT configuration', async () => {
    process.env.SSM_CONFIG_PATH = `${runnerConfigSsmPath}/`;
    process.env.SSM_TOKEN_PATH = `${runnerTokenSsmPath}/`;
    await expect(
      createMicrovmRunners(runnerConfig(), 1, githubClient, createStartRunnerConfig, 'scale-up-lambda'),
    ).resolves.toEqual({ instances: ['mvm-1'], retryableErrorCount: 0, nonRetryableErrorCount: 0 });

    expect(runMicrovmRunner).toHaveBeenCalledWith(
      expect.objectContaining({
        runHookPayload: createMicrovmRunHookPayload({
          imageArn,
          imageVersion: '2.0',
          runnerConfigSsmPath,
          runnerTokenSsmPath,
        }),
        ssmParameterStoreTags: microvmMetadataTags,
      }),
    );
    expect(createStartRunnerConfig).toHaveBeenCalledWith(runnerConfig(), ['mvm-1'], githubClient, expect.any(Object));
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
    vi.mocked(runMicrovmRunner)
      .mockResolvedValueOnce({ microvmId: 'mvm-1', metadataTags: canonicalMetadataTags })
      .mockResolvedValueOnce({ microvmId: 'mvm-2', metadataTags: canonicalMetadataTags });
    createStartRunnerConfig.mockImplementation(async (_config, runnerIds, _client, options) => {
      await options?.onJitConfigCreated?.(runnerIds[0], {
        githubRunnerId: `github-${runnerIds[0]}`,
        runnerLabels: ['self-hosted', 'microvm'],
      });
      return [];
    });

    await expect(
      createMicrovmRunners(runnerConfig(), 2, githubClient, createStartRunnerConfig, 'pool-lambda'),
    ).resolves.toEqual({ instances: ['mvm-1', 'mvm-2'], retryableErrorCount: 0, nonRetryableErrorCount: 0 });

    expect(runMicrovmRunner).toHaveBeenNthCalledWith(1, {
      config: expect.objectContaining({ imageIdentifier: imageArn }),
      environment: 'unit-test',
      runHookPayload: createMicrovmRunHookPayload({
        imageArn,
        imageVersion: '2.0',
        runnerConfigSsmPath,
        runnerTokenSsmPath,
      }),
      runnerOwner: 'Codertocat',
      runnerType: 'Org',
      ssmParameterStoreTags: microvmMetadataTags,
      source: 'pool-lambda',
    });
    expect(createStartRunnerConfig).toHaveBeenCalledTimes(2);
    const options = createStartRunnerConfig.mock.calls[0][3];
    expect(options?.getRunnerConfigMetadata?.('mvm-1')).toEqual([{ key: 'MicrovmId', value: 'mvm-1' }]);
    expect(setMicrovmGithubRunnerMetadata).toHaveBeenNthCalledWith(
      1,
      providerConfig,
      'mvm-1',
      {
        githubRunnerId: 'github-mvm-1',
        runnerLabels: ['self-hosted', 'microvm'],
      },
      canonicalMetadataTags,
    );
  });

  it('applies supported dynamic labels to the provider configuration', async () => {
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
    });

    expect(runMicrovmRunner).toHaveBeenCalledWith({
      config: {
        egressNetworkConnectors: [overrideEgressConnectorArn],
        imageIdentifier: overrideImageArn,
        imageVersion: '3.0',
        executionRoleArn: 'arn:aws:iam::123456789012:role/microvm-runner',
        metadataSsmPath,
        runnerTokenSsmPath,
      },
      environment: 'unit-test',
      runHookPayload: createMicrovmRunHookPayload({
        imageArn: overrideImageArn,
        imageVersion: '3.0',
        runnerConfigSsmPath,
        runnerTokenSsmPath,
      }),
      runnerOwner: 'Codertocat',
      runnerType: 'Org',
      ssmParameterStoreTags: microvmMetadataTags,
      source: 'scale-up-lambda',
    });
    expect(setMicrovmGithubRunnerMetadata).toHaveBeenCalledWith(
      {
        ...providerConfig,
        egressNetworkConnectors: [overrideEgressConnectorArn],
        imageIdentifier: overrideImageArn,
        imageVersion: '3.0',
      },
      'mvm-1',
      { githubRunnerId: 'github-mvm-1', runnerLabels: [] },
      canonicalMetadataTags,
    );
  });

  it('retries a JIT setup failure even when runner cleanup fails', async () => {
    createStartRunnerConfig.mockResolvedValue(['mvm-1']);
    vi.mocked(terminateMicrovm).mockRejectedValue(new Error('cleanup failed'));

    await expect(
      createMicrovmRunners(runnerConfig(), 1, githubClient, createStartRunnerConfig, 'scale-up-lambda'),
    ).resolves.toEqual({ instances: [], retryableErrorCount: 1, nonRetryableErrorCount: 0 });

    expect(terminateMicrovm).toHaveBeenCalledWith('mvm-1', providerConfig);
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

    expect(terminateMicrovm).toHaveBeenCalledWith('mvm-1', providerConfig);
  });
});

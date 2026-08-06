import type { Octokit } from '@octokit/rest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateGitHubRunnerConfig, CreateStartRunnerConfig } from '../../../../core';
import { listMicrovmRunners } from './microvms';
import { createMicrovmRunners } from './runner-config';
import { createMicrovmScaleUpProvider } from './scale-up';

vi.mock('./microvms', () => ({ listMicrovmRunners: vi.fn() }));
vi.mock('./runner-config', () => ({ createMicrovmRunners: vi.fn() }));

const createStartRunnerConfig = vi.fn<CreateStartRunnerConfig>();
const githubClient = {} as Octokit;
const overrideImageArn = 'arn:aws:lambda:eu-west-1:123456789012:microvm-image:runner-large';
const overrideEgressConnectorArn =
  'arn:aws:lambda:eu-west-1:123456789012:network-connector:github-runner-private-egress';
const githubRunnerConfig: CreateGitHubRunnerConfig = {
  ephemeral: true,
  enableJitConfig: true,
  runnerLabels: 'self-hosted,linux,arm64,microvm',
  runnerGroup: 'Default',
  runnerNamePrefix: '',
  runnerOwner: 'Codertocat',
  runnerType: 'Org',
  disableAutoUpdate: true,
  ssmTokenPath: '/runner/token',
  ssmConfigPath: '/runner/config',
  ssmParameterStoreTags: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ENVIRONMENT = 'unit-test';
  vi.mocked(listMicrovmRunners).mockResolvedValue([
    { id: 'mvm-current', owner: 'Codertocat', type: 'Org', state: 'RUNNING' },
  ]);
  vi.mocked(createMicrovmRunners).mockResolvedValue({
    instances: ['mvm-new'],
    retryableErrorCount: 0,
    nonRetryableErrorCount: 0,
  });
});

describe('createMicrovmScaleUpProvider', () => {
  it('resolves supported resource override labels and registers them on the runner', async () => {
    const provider = createMicrovmScaleUpProvider(createStartRunnerConfig);

    await expect(
      provider.resolveLabelsForRunners([
        `ghr-microvm-egress-network-connectors:${overrideEgressConnectorArn}`,
        `ghr-microvm-image-arn:${overrideImageArn}`,
        'ghr-microvm-image-version:3.0',
        'ghr-microvm-maximum-duration-in-seconds:7200',
      ]),
    ).resolves.toEqual({
      runnerLabels: [
        `ghr-microvm-egress-network-connectors:${overrideEgressConnectorArn}`,
        `ghr-microvm-image-arn:${overrideImageArn}`,
        'ghr-microvm-image-version:3.0',
        'ghr-microvm-maximum-duration-in-seconds:7200',
      ],
      state: {
        overrides: {
          egressNetworkConnectors: [overrideEgressConnectorArn],
          imageIdentifier: overrideImageArn,
          imageVersion: '3.0',
          maximumDurationInSeconds: 7200,
        },
      },
    });
  });

  it('rejects unsupported MicroVM override labels at the control-plane boundary', async () => {
    const provider = createMicrovmScaleUpProvider(createStartRunnerConfig);

    await expect(provider.resolveLabelsForRunners(['ghr-microvm-memory:8192'])).rejects.toThrow(
      "key 'memory' is not a supported MicroVM override",
    );
  });

  it('counts managed MicroVMs for the runner owner', async () => {
    const provider = createMicrovmScaleUpProvider(createStartRunnerConfig);

    await expect(
      provider.getCurrentRunners({ overrides: {} }, { runnerOwner: 'Codertocat', runnerType: 'Org' }),
    ).resolves.toBe(1);
    expect(listMicrovmRunners).toHaveBeenCalledWith({
      environment: 'unit-test',
      runnerOwner: 'Codertocat',
      runnerType: 'Org',
    });
  });

  it('delegates runner creation to the shared MicroVM lifecycle', async () => {
    const provider = createMicrovmScaleUpProvider(createStartRunnerConfig);

    await expect(
      provider.createRunners({
        githubRunnerConfig,
        numberOfRunners: 1,
        githubInstallationClient: githubClient,
        state: { overrides: { imageVersion: '3.0' } },
      }),
    ).resolves.toEqual({ instances: ['mvm-new'], retryableErrorCount: 0, nonRetryableErrorCount: 0 });
    expect(createMicrovmRunners).toHaveBeenCalledWith(
      githubRunnerConfig,
      1,
      githubClient,
      createStartRunnerConfig,
      'scale-up-lambda',
      { imageVersion: '3.0' },
    );
  });
});

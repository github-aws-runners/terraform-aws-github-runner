import {
  MAX_MANIFEST_BYTES,
  parseScaleSetControllerManifest,
  parseScaleSetReconcilerConfig,
  parseScaleSetServiceConfig,
} from './config';

function runnerConfig(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    runnerConfigName: 'linux-x64',
    githubConfigUrl: 'https://github.com/example',
    scaleSetId: 123,
    expectedScaleSetName: 'linux-x64',
    expectedRunnerGroupId: null,
    minRunners: 0,
    maxRunners: 20,
    githubApp: {
      appIdParameterName: '/runner/app/id',
      privateKeyParameterName: '/runner/app/key',
      installationIdParameterName: '/runner/app/installation-id',
    },
    computeProvider: { type: 'ec2', configuration: { subnetIds: ['subnet-1'] } },
    ...overrides,
  };
}

describe('scale-set service configuration', () => {
  it('parses the production SSM group source and runtime defaults', () => {
    expect(
      parseScaleSetServiceConfig({
        SCALE_SET_CONTROLLER_GROUP_NAME: 'ec2-default',
        SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH: '/runner/groups/ec2-default',
        SCALE_SET_CONTROLLER_GROUP_CONFIG_REVISION: '42',
      }),
    ).toEqual({
      groupName: 'ec2-default',
      groupConfigPath: '/runner/groups/ec2-default',
      groupRevision: '42',
      healthPort: 8080,
      healthStaleAfterMs: 180000,
      shutdownTimeoutMs: 110000,
      sessionCloseTimeoutMs: 10000,
      reconnectInitialBackoffMs: 1000,
      reconnectMaxBackoffMs: 30000,
    });
  });

  it('supports bounded inline manifests for local use', () => {
    const manifest = JSON.stringify({ version: 1, groupName: 'local', reconcilers: [runnerConfig()] });
    expect(parseScaleSetServiceConfig({ SCALE_SET_CONTROLLER_MANIFEST: manifest }).manifest).toBe(manifest);
    expect(() =>
      parseScaleSetServiceConfig({
        SCALE_SET_CONTROLLER_MANIFEST: manifest,
        SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH: '/both',
      }),
    ).toThrow('provide exactly one');
    expect(() =>
      parseScaleSetServiceConfig({ SCALE_SET_CONTROLLER_MANIFEST: 'x'.repeat(MAX_MANIFEST_BYTES + 1) }),
    ).toThrow('must not exceed');
  });

  it('validates production selectors and numeric runtime settings', () => {
    expect(() => parseScaleSetServiceConfig({})).toThrow('provide exactly one');
    expect(() =>
      parseScaleSetServiceConfig({
        SCALE_SET_CONTROLLER_GROUP_NAME: 'bad name',
        SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH: '/valid',
        SCALE_SET_CONTROLLER_GROUP_CONFIG_REVISION: '1',
      }),
    ).toThrow('group name');
    expect(() =>
      parseScaleSetServiceConfig({
        SCALE_SET_CONTROLLER_GROUP_NAME: 'valid',
        SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH: '/valid',
        SCALE_SET_CONTROLLER_GROUP_CONFIG_REVISION: '1',
        SCALE_SET_RECONNECT_INITIAL_BACKOFF_SECONDS: '31',
        SCALE_SET_RECONNECT_MAX_BACKOFF_SECONDS: '30',
      }),
    ).toThrow('must not exceed');
  });
});

describe('parseScaleSetControllerManifest', () => {
  it('parses the frozen flat runner-config schema and defaults', () => {
    expect(parseScaleSetReconcilerConfig(runnerConfig(), 0, 'group')).toMatchObject({
      schemaVersion: 1,
      runnerConfigName: 'linux-x64',
      scaleSetName: 'linux-x64',
      bootTimeoutMinutes: 10,
      sessionOwner: 'group.linux-x64',
      workFolder: '_work',
      forceGhes: false,
      sslVerify: true,
      computeProvider: { type: 'ec2', configuration: { subnetIds: ['subnet-1'] } },
    });
  });

  it('normalizes explicit optional settings', () => {
    expect(
      parseScaleSetReconcilerConfig(
        runnerConfig({
          expectedRunnerGroupId: 7,
          sessionOwner: 'owner/group',
          workFolder: 'runner/_work',
          forceGhes: true,
          sslVerify: false,
          userAgent: 'github-aws-runners/test',
          bootTimeoutMinutes: 30,
        }),
        0,
        'group',
      ),
    ).toMatchObject({
      expectedRunnerGroupId: 7,
      sessionOwner: 'owner/group',
      workFolder: 'runner/_work',
      forceGhes: true,
      sslVerify: false,
      bootTimeoutMinutes: 30,
    });
  });

  it('accepts a runner-group name for runtime ID resolution', () => {
    expect(
      parseScaleSetReconcilerConfig(runnerConfig({ runnerGroupName: 'self-hosted-linux' }), 0, 'group'),
    ).toMatchObject({ runnerGroupName: 'self-hosted-linux' });
  });

  it('accepts scaleSetName without a GitHub-generated scale-set ID', () => {
    const parsed = parseScaleSetReconcilerConfig(
      runnerConfig({
        scaleSetName: 'linux-x64',
        expectedScaleSetName: undefined,
        runnerGroupName: 'self-hosted-linux',
        scaleSetId: undefined,
      }),
      0,
      'group',
    );
    expect(parsed).toMatchObject({ scaleSetName: 'linux-x64', runnerGroupName: 'self-hosted-linux' });
    expect(parsed).not.toHaveProperty('scaleSetId');
  });

  it('bounds the derived session owner for maximum-length names', () => {
    const parsed = parseScaleSetReconcilerConfig(
      runnerConfig({ runnerConfigName: 'r'.repeat(128) }),
      0,
      'g'.repeat(128),
    );
    expect(parsed.sessionOwner).toHaveLength(256);
    expect(parsed.sessionOwner).toMatch(/\.[a-f0-9]{16}$/);
  });

  it('rejects unsafe URLs, unknown fields, prototype keys, and schema drift', () => {
    expect(() =>
      parseScaleSetReconcilerConfig(runnerConfig({ githubConfigUrl: 'http://github.com/example' }), 0, 'g'),
    ).toThrow('must use HTTPS');
    expect(() => parseScaleSetReconcilerConfig(runnerConfig({ extra: true }), 0, 'g')).toThrow('unknown field');
    expect(() => parseScaleSetReconcilerConfig(runnerConfig({ schemaVersion: 2 }), 0, 'g')).toThrow('schemaVersion');
    expect(() => parseScaleSetReconcilerConfig(runnerConfig({ bootTimeoutMinutes: 0 }), 0, 'g')).toThrow(
      'bootTimeoutMinutes',
    );
    expect(() => parseScaleSetReconcilerConfig(runnerConfig({ bootTimeoutMinutes: 121 }), 0, 'g')).toThrow(
      'bootTimeoutMinutes',
    );
    const polluted = JSON.parse('{"__proto__":{"admin":true}}') as unknown;
    expect(() =>
      parseScaleSetReconcilerConfig(
        runnerConfig({ computeProvider: { type: 'ec2', configuration: polluted } }),
        0,
        'g',
      ),
    ).toThrow('forbidden field');
  });

  it('rejects duplicate runner names and scale-set IDs within an equivalent GitHub scope', () => {
    expect(() =>
      parseScaleSetControllerManifest({ version: 1, groupName: 'g', reconcilers: [runnerConfig(), runnerConfig()] }),
    ).toThrow('duplicated');
    expect(() =>
      parseScaleSetControllerManifest({
        version: 1,
        groupName: 'g',
        reconcilers: [
          runnerConfig(),
          runnerConfig({ runnerConfigName: 'other', githubConfigUrl: 'https://GITHUB.com/example/' }),
        ],
      }),
    ).toThrow('duplicated');
  });

  it('allows the same numeric scale-set ID in different GitHub scopes', () => {
    expect(
      parseScaleSetControllerManifest({
        version: 1,
        groupName: 'g',
        reconcilers: [
          runnerConfig(),
          runnerConfig({ runnerConfigName: 'other', githubConfigUrl: 'https://github.com/another' }),
        ],
      }).reconcilers,
    ).toHaveLength(2);
  });
});

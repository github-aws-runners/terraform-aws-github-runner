import { createControllerManifestLoader, type ParametersByPathClient } from './parameter-store';
import type { ScaleSetServiceConfig } from './config';

function leaf(name: string, id: number): string {
  return JSON.stringify({
    schemaVersion: 1,
    runnerConfigName: name,
    githubConfigUrl: 'https://github.com/example',
    scaleSetId: id,
    expectedScaleSetName: name,
    expectedRunnerGroupId: null,
    minRunners: 0,
    maxRunners: 10,
    sslVerify: true,
    githubApp: {
      appIdParameterName: '/app/id',
      privateKeyParameterName: '/app/key',
      installationIdParameterName: '/app/installation',
    },
    computeProvider: { type: 'ec2', configuration: {} },
  });
}

const config: ScaleSetServiceConfig = {
  groupName: 'group',
  groupConfigPath: '/groups/group',
  groupRevision: 'rev-1',
  healthPort: 8080,
  healthStaleAfterMs: 1000,
  shutdownTimeoutMs: 1000,
  sessionCloseTimeoutMs: 1000,
  reconnectInitialBackoffMs: 100,
  reconnectMaxBackoffMs: 1000,
};

describe('createControllerManifestLoader', () => {
  it('paginates direct children, sorts them, and returns a versioned group', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Parameters: [{ Name: '/groups/group/b', Value: leaf('b', 2) }], NextToken: 'next' })
      .mockResolvedValueOnce({ Parameters: [{ Name: '/groups/group/a', Value: leaf('a', 1) }] });
    const manifest = await createControllerManifestLoader({ send } as ParametersByPathClient).load(config);
    expect(manifest).toMatchObject({ version: 1, groupName: 'group', revision: 'rev-1' });
    expect(manifest.reconcilers.map(({ runnerConfigName }) => runnerConfigName)).toEqual(['a', 'b']);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('uses the injected inline manifest loader path for local tests', async () => {
    const inline = JSON.stringify({ version: 1, groupName: 'local', reconcilers: [JSON.parse(leaf('a', 1))] });
    const send = vi.fn();
    await expect(
      createControllerManifestLoader({ send } as ParametersByPathClient).load({ ...config, manifest: inline }),
    ).resolves.toMatchObject({
      groupName: 'local',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    [{ Parameters: [] }, 'contains no runner configs'],
    [{ Parameters: [{ Name: '/groups/group/nested/a', Value: leaf('a', 1) }] }, 'outside the direct group path'],
    [{ Parameters: [{ Name: '/groups/group/wrong', Value: leaf('a', 1) }] }, 'must match runnerConfigName'],
    [{ Parameters: [{ Name: '/groups/group/a', Value: '{' }] }, 'contains invalid JSON'],
    [{ Parameters: [{ Name: undefined, Value: leaf('a', 1) }] }, 'incomplete parameter'],
  ])('rejects malformed SSM group pages', async (page, message) => {
    await expect(
      createControllerManifestLoader({ send: vi.fn().mockResolvedValue(page) }).load(config),
    ).rejects.toThrow(message);
  });

  it('rejects repeated pagination tokens', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Parameters: [{ Name: '/groups/group/a', Value: leaf('a', 1) }], NextToken: 'same' })
      .mockResolvedValueOnce({ Parameters: [], NextToken: 'same' });
    await expect(createControllerManifestLoader({ send }).load(config)).rejects.toThrow('repeated token');
  });
});

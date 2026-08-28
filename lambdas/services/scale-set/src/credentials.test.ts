const authMocks = vi.hoisted(() => ({ createAppAuth: vi.fn(), requestDefaults: vi.fn() }));
vi.mock('@octokit/auth-app', () => ({ createAppAuth: authMocks.createAppAuth }));
vi.mock('@octokit/request', () => ({ request: { defaults: authMocks.requestDefaults } }));

import type { ScaleSetFetch } from '@aws-github-runner/github-actions-scale-set';

import { createGitHubAppAccessTokenProvider, loadGitHubAppCredentials, type ParameterStore } from './credentials';

const references = {
  appIdParameterName: '/app/id',
  privateKeyParameterName: '/app/key',
  installationIdParameterName: '/app/installation',
};

function encodedKey(body: string): string {
  return Buffer.from(`-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`).toString('base64');
}

describe('GitHub App credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.requestDefaults.mockReturnValue(vi.fn());
  });

  it('validates and decodes referenced SSM values', async () => {
    const store: ParameterStore = {
      get: vi.fn().mockResolvedValue(
        new Map([
          ['/app/id', '123'],
          ['/app/installation', '456'],
          ['/app/key', encodedKey('abc')],
        ]),
      ),
    };
    await expect(loadGitHubAppCredentials(references, store)).resolves.toMatchObject({
      appId: '123',
      installationId: 456,
      privateKey: expect.stringContaining('BEGIN PRIVATE KEY'),
    });
  });

  it('reuses auth for unchanged credentials and recreates it after rotation', async () => {
    const values = [encodedKey('first'), encodedKey('first'), encodedKey('second')];
    const store: ParameterStore = {
      get: vi.fn(
        async () =>
          new Map([
            ['/app/id', '123'],
            ['/app/installation', '456'],
            ['/app/key', values.shift() as string],
          ]),
      ),
    };
    const firstAuth = vi.fn().mockResolvedValue({ token: 'token-one', expiresAt: '2099-01-01T00:00:00Z' });
    const secondAuth = vi.fn().mockResolvedValue({ token: 'token-two', expiresAt: '2099-01-01T00:00:00Z' });
    const fetchImplementation = vi.fn<ScaleSetFetch>();
    authMocks.createAppAuth.mockReturnValueOnce(firstAuth).mockReturnValueOnce(secondAuth);

    const provider = await createGitHubAppAccessTokenProvider(
      references,
      'https://github.com/example',
      false,
      store,
      fetchImplementation,
    );
    await provider();
    await provider();
    await provider();

    expect(store.get).toHaveBeenCalledTimes(3);
    expect(authMocks.createAppAuth).toHaveBeenCalledTimes(2);
    expect(authMocks.requestDefaults).toHaveBeenCalledWith({
      baseUrl: 'https://api.github.com',
      request: { fetch: fetchImplementation },
    });
    expect(firstAuth).toHaveBeenCalledTimes(2);
    expect(secondAuth).toHaveBeenCalledTimes(1);
  });

  it('discovers the installation ID from the configured organization when SSM does not provide one', async () => {
    const store: ParameterStore = {
      get: vi.fn().mockResolvedValue(
        new Map([
          ['/app/id', '123'],
          ['/app/key', encodedKey('abc')],
        ]),
      ),
    };
    const appAuth = vi.fn().mockResolvedValue({ token: 'app-jwt' });
    const installationAuth = vi
      .fn()
      .mockResolvedValue({ token: 'installation-token', expiresAt: '2099-01-01T00:00:00Z' });
    const fetchImplementation = vi.fn<ScaleSetFetch>().mockResolvedValue(
      new Response(JSON.stringify({ installations: [{ id: 456, account: { login: 'example' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    authMocks.createAppAuth.mockReturnValueOnce(appAuth).mockReturnValueOnce(installationAuth);

    const provider = await createGitHubAppAccessTokenProvider(
      { appIdParameterName: '/app/id', privateKeyParameterName: '/app/key' },
      'https://github.com/example',
      false,
      store,
      fetchImplementation,
    );

    await expect(provider()).resolves.toMatchObject({ token: 'installation-token' });
    await expect(provider()).resolves.toMatchObject({ token: 'installation-token' });
    expect(appAuth).toHaveBeenCalledWith({ type: 'app' });
    expect(installationAuth).toHaveBeenCalledWith({ type: 'installation', installationId: 456 });
    expect(appAuth).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'https://api.github.com/app/installations?per_page=100&page=1',
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer app-jwt' }),
      }),
    );
  });

  it.each([
    [new Map([['/app/id', '123']]), 'was not returned'],
    [
      new Map([
        ['/app/id', 'bad id'],
        ['/app/installation', '1'],
        ['/app/key', encodedKey('abc')],
      ]),
      'App ID',
    ],
    [
      new Map([
        ['/app/id', '1'],
        ['/app/installation', 'zero'],
        ['/app/key', encodedKey('abc')],
      ]),
      'positive integer',
    ],
    [
      new Map([
        ['/app/id', '1'],
        ['/app/installation', '2'],
        ['/app/key', 'not-base64'],
      ]),
      'canonical base64',
    ],
  ])('rejects malformed credential parameters', async (values, message) => {
    await expect(loadGitHubAppCredentials(references, { get: vi.fn().mockResolvedValue(values) })).rejects.toThrow(
      message,
    );
  });
});

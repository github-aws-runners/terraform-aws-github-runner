import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import nock from 'nock';
import { createAppAuth } from '@octokit/auth-app';
import { getOctokit } from './octokit';
import { createCommonStorage } from '@aws-github-runner/storage-providers';
import {
  createOctokitClient,
  reportAppRateLimit,
  reportAppSecondaryRateLimit,
  resetAppCredentialsCache,
  selectAppIndex,
} from './auth';
import { installationScope } from './installation-scope';
import { withAppFailover } from './app-failover';
import { metricGitHubAppRateLimit } from './rate-limit';

vi.mock('@aws-github-runner/storage-providers', () => ({ createCommonStorage: vi.fn() }));
vi.mock('@octokit/auth-app');
vi.mock('./rate-limit', () => ({ metricGitHubAppRateLimit: vi.fn() }));
const store = {
  get: vi.fn().mockResolvedValue([
    { appId: 1, privateKey: 'key' },
    { appId: 2, privateKey: 'key' },
  ]),
};
const api = (token: string) => nock('https://api.github.com', { reqheaders: { authorization: `token ${token}` } });
const path = '/orgs/example/actions/runners/generate-jitconfig';
const headers = { 'x-ratelimit-remaining': '13000', 'x-ratelimit-limit': '15000' };

beforeEach(() => {
  vi.clearAllMocks();
  resetAppCredentialsCache();
  vi.mocked(createCommonStorage).mockReturnValue({ githubAppCredentials: store });
  vi.spyOn(Math, 'random').mockReturnValue(0);
  nock.disableNetConnect();
});
afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  vi.restoreAllMocks();
});

async function client() {
  const factory = vi.fn(async (index: number) => createOctokitClient(`app-${index}`, '', index));
  return { client: await withAppFailover(0, factory, store), factory };
}

describe('request-level app failover with real Octokit retry/throttling hooks', () => {
  it.each([
    [429, 'Too many requests', headers],
    [429, 'You have exceeded a secondary rate limit', { ...headers, 'retry-after': '120' }],
    [
      403,
      'API rate limit exceeded',
      { ...headers, 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) },
    ],
    [403, 'You have exceeded a secondary rate limit', headers],
  ])('switches on %s %s without replaying successful JIT requests', async (status, message, limitedHeaders) => {
    const { client: gh, factory } = await client();
    const first = api('app-0')
      .post(path, { name: 'runner-1' })
      .reply(200, { id: 1 }, headers)
      .post(path, { name: 'runner-2' })
      .reply(status, { message }, limitedHeaders);
    const second = api('app-1').post(path, { name: 'runner-2' }).reply(200, { id: 2 }, headers);
    expect((await gh.request(`POST ${path}`, { name: 'runner-1' })).data).toEqual({ id: 1 });
    // Prefer the observed app rather than the as-yet unobserved second app.
    reportAppRateLimit(0, 13000, undefined, 'actions_runner_registration');
    reportAppRateLimit(1, 10000, undefined, 'actions_runner_registration');
    expect((await gh.request(`POST ${path}`, { name: 'runner-2' })).data).toEqual({ id: 2 });
    expect(first.isDone()).toBe(true);
    expect(second.isDone()).toBe(true);
    expect(factory.mock.calls.map(([index]) => index)).toEqual([0, 1]);
    expect(metricGitHubAppRateLimit).toHaveBeenLastCalledWith(expect.objectContaining(headers), 1, expect.anything());
  });

  it('keeps core requests available after every App exhausts registration quota', async () => {
    const { client: gh } = await client();
    const exhausted = {
      'x-ratelimit-remaining': '0',
      'x-ratelimit-resource': 'actions_runner_registration',
      'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600),
    };
    const first = api('app-0').post(path).reply(403, { message: 'API rate limit exceeded' }, exhausted);
    const second = api('app-1').post(path).reply(403, { message: 'API rate limit exceeded' }, exhausted);
    await expect(gh.request(`POST ${path}`)).rejects.toMatchObject({ status: 403 });
    expect(first.isDone() && second.isDone()).toBe(true);
    await expect(selectAppIndex(store, new Set(), 'actions_runner_registration')).rejects.toThrow(
      'No eligible GitHub App',
    );
    const core = api('app-0')
      .get('/repos/example/repo/actions/jobs/1')
      .reply(200, { id: 1 }, { ...headers, 'x-ratelimit-resource': 'core' });
    await expect(gh.request('GET /repos/example/repo/actions/jobs/1')).resolves.toMatchObject({ data: { id: 1 } });
    expect(core.isDone()).toBe(true);
  });

  it.each([
    '/orgs/example/actions/runners/generate-jitconfig',
    '/repos/example/repo/actions/runners/generate-jitconfig',
  ])('selects the registration budget before the first request to %s', async (jitPath) => {
    const { client: gh } = await client();
    for (const index of [0, 1]) {
      const core = api(`app-${index}`)
        .get('/repos/example/repo/actions/jobs/1')
        .reply(
          200,
          {},
          {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-resource': 'core',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600),
          },
        );
      await gh.request('GET /repos/example/repo/actions/jobs/1');
      expect(core.isDone()).toBe(true);
    }
    const jit = api('app-0').post(jitPath).twice().reply(200, { encoded_jit_config: 'config' }, headers);
    await expect(gh.request(`POST ${jitPath}`)).resolves.toMatchObject({ data: { encoded_jit_config: 'config' } });
    await expect(gh.request(`POST ${jitPath}`)).resolves.toMatchObject({ data: { encoded_jit_config: 'config' } });
    expect(jit.isDone()).toBe(true);
  });

  it('keeps JIT selection on registration quota after another client fails core authentication', async () => {
    const factory = vi.fn(async (index: number) => {
      if (index === 1)
        throw {
          status: 403,
          response: {
            headers: {
              'x-ratelimit-resource': 'core',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600),
            },
          },
        };
      return createOctokitClient('app-0', '', index);
    });
    const gh = await withAppFailover(0, factory, store);
    reportAppRateLimit(0, 0, Date.now() + 600000, 'core');
    reportAppRateLimit(0, 100, Date.now() + 600000, 'actions_runner_registration');
    const jit = api('app-0')
      .post(path)
      .twice()
      .reply(200, { id: 1 }, { ...headers, 'x-ratelimit-resource': 'actions_runner_registration' });
    await expect(gh.request(`POST ${path}`)).resolves.toMatchObject({ data: { id: 1 } });
    await expect(gh.request(`POST ${path}`)).resolves.toMatchObject({ data: { id: 1 } });
    expect(jit.isDone()).toBe(true);
    expect(factory.mock.calls.map(([index]) => index)).toEqual([0, 1]);
  });

  it('isolates installation budgets between owners and GitHub endpoints, including seed selection', async () => {
    const a = installationScope('', 'OWNER-A/repo');
    const b = installationScope('', 'owner-b');
    const enterprise = installationScope('https://github.example/api/v3', 'owner-a');
    expect(a).toBe(installationScope('', 'owner-a'));
    for (const index of [0, 1]) reportAppRateLimit(index, 0, Date.now() + 600000, 'core', a);
    await expect(selectAppIndex(store, undefined, 'core', undefined, a)).rejects.toThrow('No eligible GitHub App');
    expect(await selectAppIndex(store, undefined, 'core', undefined, b)).toBe(0);
    expect(await selectAppIndex(store, undefined, 'core', undefined, enterprise)).toBe(0);
    const factory = vi.fn(async (index: number) => createOctokitClient(`app-${index}`, '', index));
    await expect(withAppFailover(0, factory, store, a)).rejects.toThrow('No eligible GitHub App');
    const gh = await withAppFailover(0, factory, store, b);
    const request = api('app-0')
      .get('/orgs/owner-b/actions/runners')
      .reply(
        200,
        {},
        {
          'x-ratelimit-remaining': '0',
          'x-ratelimit-resource': 'core',
          'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600),
        },
      );
    await gh.request('GET /orgs/owner-b/actions/runners');
    expect(request.isDone()).toBe(true);
    expect(await selectAppIndex(store, undefined, 'core', undefined, b)).toBe(1);
    expect(await selectAppIndex(store, undefined, 'core', undefined, enterprise)).toBe(0);
  });

  it('preserves exhaustion against out-of-order positive responses and earlier reset times', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    reportAppRateLimit(0, 0, now + 120000, 'actions_runner_registration');
    reportAppRateLimit(0, 500, now + 60000, 'actions_runner_registration');
    reportAppRateLimit(0, 0, now + 30000, 'actions_runner_registration');
    clock.mockReturnValue(now + 61000);
    expect(await selectAppIndex(store, new Set(), 'actions_runner_registration')).toBe(1);
    expect(await selectAppIndex(store, new Set(), 'core')).toBe(0);
    clock.mockReturnValue(now + 121000);
    expect(await selectAppIndex(store, new Set(), 'actions_runner_registration')).toBe(0);
  });

  it('tries each app at most once and returns the last HTTP error without sleeping', async () => {
    const { client: gh } = await client();
    const first = api('app-0').get('/test').reply(429, { message: 'Too many requests' }, headers);
    const second = api('app-1').get('/test').reply(429, { message: 'Still limited' }, headers);
    await expect(gh.request('GET /test')).rejects.toMatchObject({ status: 429, message: 'Still limited' });
    expect(first.isDone() && second.isDone()).toBe(true);
    await expect(selectAppIndex(store)).rejects.toThrow('No eligible GitHub App');
  });

  it.each([401, 403, 404, 422])('does not fail over ordinary HTTP %s failures', async (status) => {
    const { client: gh, factory } = await client();
    api('app-0').get('/test').reply(status, { message: 'Permission or validation failure' });
    await expect(gh.request('GET /test')).rejects.toMatchObject({ status });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('fails over rate-limited installation lookup or token minting', async () => {
    const factory = vi.fn(async (index: number) => {
      if (index === 0) throw { status: 429, response: { headers } };
      return createOctokitClient('app-1', '', index);
    });
    const gh = await withAppFailover(0, factory, store);
    const second = api('app-1').get('/test').reply(200, {}, headers);
    await gh.request('GET /test');
    expect(second.isDone()).toBe(true);
    expect(factory.mock.calls.map(([index]) => index)).toEqual([0, 1]);
  });

  it('honors Retry-After beyond the default minute, then makes the app eligible again', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const { client: gh } = await client();
    api('app-0')
      .get('/test')
      .reply(429, { message: 'Too many requests' }, { ...headers, 'retry-after': '120' });
    api('app-1').get('/test').reply(200, {}, headers);
    await gh.request('GET /test');
    clock.mockReturnValue(now + 61_000);
    expect(await selectAppIndex(store)).toBe(1);
    clock.mockReturnValue(now + 122_000);
    expect(await selectAppIndex(store)).toBe(0);
  });

  it('expires primary observations at reset and never overrides an all-app cooldown', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    reportAppRateLimit(0, 0, Date.now() + 120000);
    reportAppRateLimit(1, 100, Date.now() + 120000);
    expect(await selectAppIndex(store)).toBe(1);
    clock.mockReturnValue(now + 121_000);
    expect(await selectAppIndex(store)).toBe(0);
    reportAppSecondaryRateLimit(0);
    reportAppSecondaryRateLimit(1);
    await expect(selectAppIndex(store)).rejects.toThrow('No eligible GitHub App');
  });
});

describe('installation identity across failover', () => {
  it.each([true, false])('resolves each app installation for org mode %s', async (orgMode) => {
    vi.mocked(createAppAuth).mockImplementation((options) => {
      const auth = vi.fn(async ({ type }: { type: string }) => ({
        type,
        token: type === 'app' ? `jwt-${options.appId}` : `installation-${options.installationId}`,
      }));
      return Object.assign(auth, { hook: vi.fn() }) as unknown as ReturnType<typeof createAppAuth>;
    });
    const installationPath = orgMode ? '/orgs/example/installation' : '/repos/example/repo/installation';
    const firstLookup = api('jwt-1').get(installationPath).reply(200, { id: 11 });
    const secondLookup = api('jwt-2').get(installationPath).reply(200, { id: 22 });
    const endpoint = orgMode ? '/orgs/example/actions/runners' : '/repos/example/repo/actions/runners';
    const first = api('installation-11').get(endpoint).reply(429, { message: 'Too many requests' }, headers);
    const second = api('installation-22').get(endpoint).reply(200, { runners: [] }, headers);
    const gh = await getOctokit('', orgMode, {
      id: 1,
      eventType: 'workflow_job',
      repositoryOwner: 'example',
      repositoryName: 'repo',
      repoOwnerType: 'Organization',
      installationId: 0,
    });
    await gh.request(`GET ${endpoint}`);
    expect([firstLookup, secondLookup, first, second].every((scope) => scope.isDone())).toBe(true);
    expect(createAppAuth).toHaveBeenCalledWith(expect.objectContaining({ appId: 2, installationId: 22 }));
  });

  it('keeps primary budgets in separate resources', async () => {
    reportAppRateLimit(0, 1000, undefined, 'core');
    reportAppRateLimit(1, 500, undefined, 'core');
    reportAppRateLimit(0, 10, undefined, 'actions_runner_registration');
    reportAppRateLimit(1, 100, undefined, 'actions_runner_registration');
    expect(await selectAppIndex(store)).toBe(0);
    expect(await selectAppIndex(store, new Set(), 'actions_runner_registration')).toBe(1);
  });
});

it('returns a single-app 429 immediately and does not attempt a cooling app again', async () => {
  const single = { get: vi.fn().mockResolvedValue([{ appId: 1, privateKey: 'key' }]) };
  const factory = vi.fn(async (index: number) => createOctokitClient('single', '', index));
  const gh = await withAppFailover(0, factory, single);
  const scope = api('single').get('/test').reply(429, { message: 'Too many requests' }, { 'retry-after': '60' });
  await expect(gh.request('GET /test')).rejects.toMatchObject({ status: 429 });
  expect(scope.isDone()).toBe(true);
  await expect(withAppFailover(0, factory, single)).rejects.toThrow('No eligible GitHub App');
  expect(factory).toHaveBeenCalledTimes(1);
  expect(single.get).toHaveBeenCalledTimes(2); // Once per wrapper, never once per request.
});

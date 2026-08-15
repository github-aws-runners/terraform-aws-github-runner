import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GitHubActionsScaleSetClient } from './client';
import { SCALE_SET_ERROR_CODES, ScaleSetHttpError } from './errors';
import { ScaleSetFetch } from './types';

type RequestInput = Parameters<ScaleSetFetch>[0];
type ServiceHandler = (url: URL, init: RequestInit) => Response | Promise<Response>;

function requestUrl(input: RequestInput): URL {
  if (input instanceof Request) {
    return new URL(input.url);
  }
  return new URL(input.toString());
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function actionsAdminToken(expiresAt = Math.floor(Date.now() / 1000) + 60 * 60): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ exp: expiresAt })).toString('base64url');
  return `${header}.${payload}.signature`;
}

function clientFixture(serviceHandler: ServiceHandler, options: { adminToken?: () => string; now?: () => Date } = {}) {
  const accessTokenProvider = vi.fn(async () => 'github-access-token');
  const registrationRequests: Array<{ url: URL; init: RequestInit }> = [];
  const serviceRequests: Array<{ url: URL; init: RequestInit }> = [];
  const fetchImplementation = vi.fn<ScaleSetFetch>(async (input, init = {}) => {
    const url = requestUrl(input);

    if (url.pathname === '/orgs/example/actions/runners/registration-token') {
      registrationRequests.push({ url, init });
      return jsonResponse({ token: 'runner-registration-token' }, 201);
    }
    if (url.pathname === '/actions/runner-registration') {
      registrationRequests.push({ url, init });
      return jsonResponse({
        url: 'https://actions.example/tenant/123/',
        token: options.adminToken?.() ?? actionsAdminToken(),
      });
    }

    serviceRequests.push({ url, init });
    return serviceHandler(url, init);
  });
  const client = new GitHubActionsScaleSetClient({
    gitHubConfigUrl: 'https://github.com/example',
    accessTokenProvider,
    fetch: fetchImplementation,
    systemInfo: { system: 'unit-test', subsystem: 'sdk' },
    now: options.now,
  });

  return {
    accessTokenProvider,
    client,
    fetchImplementation,
    registrationRequests,
    serviceRequests,
  };
}

describe('GitHubActionsScaleSetClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('bootstraps Actions authentication once and reuses the unexpired admin token', async () => {
    const fixture = clientFixture(() => jsonResponse({ count: 0, value: [] }));

    await expect(fixture.client.getRunnerScaleSet(4, 'linux')).resolves.toBeNull();
    await expect(fixture.client.getRunnerScaleSet(4, 'linux')).resolves.toBeNull();

    expect(fixture.accessTokenProvider).toHaveBeenCalledOnce();
    expect(fixture.registrationRequests).toHaveLength(2);
    expect(fixture.serviceRequests).toHaveLength(2);

    const registrationTokenRequest = fixture.registrationRequests[0];
    expect(registrationTokenRequest.url.toString()).toBe(
      'https://api.github.com/orgs/example/actions/runners/registration-token',
    );
    expect(new Headers(registrationTokenRequest.init.headers).get('Authorization')).toBe('Bearer github-access-token');
    expect(new Headers(registrationTokenRequest.init.headers).get('Content-Type')).toBe(
      'application/vnd.github.v3+json',
    );
    expect(JSON.parse(new Headers(registrationTokenRequest.init.headers).get('User-Agent') as string)).toMatchObject({
      build_commit_sha: '',
      kind: 'scaleset',
    });

    const adminConnectionRequest = fixture.registrationRequests[1];
    expect(adminConnectionRequest.url.toString()).toBe('https://api.github.com/actions/runner-registration');
    expect(new Headers(adminConnectionRequest.init.headers).get('Authorization')).toBe(
      'RemoteAuth runner-registration-token',
    );
    expect(JSON.parse(adminConnectionRequest.init.body as string)).toEqual({
      url: 'https://github.com/example',
      runner_event: 'register',
    });

    for (const { url, init } of fixture.serviceRequests) {
      expect(url.pathname).toBe('/tenant/123/_apis/runtime/runnerscalesets');
      expect(url.searchParams.get('api-version')).toBe('6.0-preview');
      expect(url.searchParams.get('runnerGroupId')).toBe('4');
      expect(url.searchParams.get('name')).toBe('linux');
      expect(new Headers(init.headers).get('Authorization')).toMatch(/^Bearer /);
    }
  });

  it('refreshes the Actions admin token when it enters the 60-second expiry window', async () => {
    let nowMs = Date.UTC(2026, 7, 14, 12, 0, 0);
    let tokenIssue = 0;
    const fixture = clientFixture(() => jsonResponse({ count: 0, value: [] }), {
      now: () => new Date(nowMs),
      adminToken: () => {
        tokenIssue += 1;
        const lifetimeSeconds = tokenIssue === 1 ? 120 : 3_600;
        return actionsAdminToken(Math.floor(nowMs / 1000) + lifetimeSeconds);
      },
    });

    await fixture.client.getRunnerScaleSet(4, 'linux');
    nowMs += 70_000;
    await fixture.client.getRunnerScaleSet(4, 'linux');

    expect(fixture.accessTokenProvider).toHaveBeenCalledTimes(2);
    expect(fixture.registrationRequests).toHaveLength(4);
    expect(tokenIssue).toBe(2);
  });

  it('retries 401 and 403 only while bootstrapping the Actions admin connection', async () => {
    let registrationTokenRequests = 0;
    let adminConnectionRequests = 0;
    let actionsRequests = 0;
    const fetchImplementation = vi.fn<ScaleSetFetch>(async (input) => {
      const url = requestUrl(input);

      if (url.pathname === '/orgs/example/actions/runners/registration-token') {
        registrationTokenRequests += 1;
        return jsonResponse({ token: 'runner-registration-token' }, 201);
      }
      if (url.pathname === '/actions/runner-registration') {
        adminConnectionRequests += 1;
        if (adminConnectionRequests === 1) {
          return jsonResponse({ message: 'not propagated' }, 401);
        }
        if (adminConnectionRequests === 2) {
          return jsonResponse({ message: 'not propagated' }, 403);
        }
        return jsonResponse({
          url: 'https://actions.example/tenant/123/',
          token: actionsAdminToken(),
        });
      }

      actionsRequests += 1;
      return jsonResponse({ count: 0, value: [] });
    });
    const client = new GitHubActionsScaleSetClient({
      gitHubConfigUrl: 'https://github.com/example',
      personalAccessToken: 'github-access-token',
      fetch: fetchImplementation,
      retry: {
        maxRetries: 2,
        initialBackoffMs: 0,
        maxBackoffMs: 0,
        requestTimeoutMs: 1_000,
      },
    });

    await expect(client.getRunnerScaleSet(4, 'linux')).resolves.toBeNull();

    expect(registrationTokenRequests).toBe(1);
    expect(adminConnectionRequests).toBe(3);
    expect(actionsRequests).toBe(1);
  });

  it('raises a typed HTTP error with Actions exception and request metadata', async () => {
    const fixture = clientFixture(
      () =>
        new Response(
          JSON.stringify({
            typeName: 'Microsoft.TeamFoundation.DistributedTask.WebApi.AgentExistsException',
            message: 'runner already exists',
          }),
          {
            status: 409,
            headers: {
              ActivityId: 'activity-123',
              'Content-Type': 'application/json',
              'X-GitHub-Request-Id': 'github-456',
            },
          },
        ),
    );

    const request = fixture.client.getRunner(71);
    await expect(request).rejects.toBeInstanceOf(ScaleSetHttpError);
    await expect(request).rejects.toMatchObject({
      code: SCALE_SET_ERROR_CODES.runnerExists,
      status: 409,
      activityId: 'activity-123',
      githubRequestId: 'github-456',
      exceptionName: 'Microsoft.TeamFoundation.DistributedTask.WebApi.AgentExistsException',
    });
  });

  it('uses the exact scale-set CRUD endpoints and legacy request body casing', async () => {
    const fixture = clientFixture((url, init) => {
      const method = init.method;
      if (method === 'GET' && url.pathname.endsWith('/runnerscalesets')) {
        return jsonResponse({
          count: url.searchParams.has('name') ? 1 : 2,
          value: [
            { id: 11, name: 'linux', RunnerSetting: { disableUpdate: true } },
            { id: 12, name: 'windows', RunnerSetting: {} },
          ],
        });
      }
      if (method === 'GET' && url.pathname.endsWith('/runnerscalesets/11')) {
        return jsonResponse({ id: 11, name: 'linux', RunnerSetting: { disableUpdate: true } });
      }
      if (method === 'POST') {
        return jsonResponse({ id: 11, name: 'linux', RunnerSetting: { disableUpdate: true } });
      }
      if (method === 'PATCH') {
        return jsonResponse({ id: 11, name: 'linux', RunnerSetting: { disableUpdate: false } });
      }
      if (method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 500 });
    });
    const createInput = {
      name: 'linux',
      runnerGroupId: 4,
      runnerSetting: { disableUpdate: true },
    };
    const updateInput = {
      labels: [{ name: 'arm64' }],
      runnerSetting: { disableUpdate: false },
    };

    await expect(fixture.client.getRunnerScaleSet(4, 'linux')).resolves.toMatchObject({
      id: 11,
      runnerSetting: { disableUpdate: true },
    });
    await expect(fixture.client.listRunnerScaleSets(4)).resolves.toHaveLength(2);
    await expect(fixture.client.getRunnerScaleSetById(11)).resolves.toMatchObject({ id: 11 });
    await expect(fixture.client.createRunnerScaleSet(createInput)).resolves.toMatchObject({ id: 11 });
    await expect(fixture.client.updateRunnerScaleSet(11, updateInput)).resolves.toMatchObject({
      id: 11,
    });
    await expect(fixture.client.deleteRunnerScaleSet(11)).resolves.toBeUndefined();

    expect(createInput).toMatchObject({ labels: [{ name: 'linux', type: 'System' }] });
    expect(updateInput).toMatchObject({ labels: [{ name: 'arm64', type: 'System' }] });

    const createRequest = fixture.serviceRequests.find(({ init }) => init.method === 'POST');
    const updateRequest = fixture.serviceRequests.find(({ init }) => init.method === 'PATCH');
    expect(createRequest).toBeDefined();
    expect(updateRequest).toBeDefined();

    const createBody = JSON.parse(createRequest?.init.body as string) as Record<string, unknown>;
    expect(createBody).toMatchObject({
      name: 'linux',
      runnerGroupId: 4,
      labels: [{ name: 'linux', type: 'System' }],
      RunnerSetting: { disableUpdate: true },
    });
    expect(createBody).not.toHaveProperty('runnerSetting');

    const updateBody = JSON.parse(updateRequest?.init.body as string) as Record<string, unknown>;
    expect(updateBody).toMatchObject({
      labels: [{ name: 'arm64', type: 'System' }],
      RunnerSetting: { disableUpdate: false },
    });
    expect(updateBody).not.toHaveProperty('runnerSetting');

    expect(fixture.serviceRequests.map(({ url, init }) => [init.method, url.pathname])).toEqual([
      ['GET', '/tenant/123/_apis/runtime/runnerscalesets'],
      ['GET', '/tenant/123/_apis/runtime/runnerscalesets'],
      ['GET', '/tenant/123/_apis/runtime/runnerscalesets/11'],
      ['POST', '/tenant/123/_apis/runtime/runnerscalesets'],
      ['PATCH', '/tenant/123/_apis/runtime/runnerscalesets/11'],
      ['DELETE', '/tenant/123/_apis/runtime/runnerscalesets/11'],
    ]);
    for (const { url } of fixture.serviceRequests) {
      expect(url.searchParams.get('api-version')).toBe('6.0-preview');
    }
  });

  it('uses the exact runner-group, JIT, and agent endpoints', async () => {
    const fixture = clientFixture((url, init) => {
      if (url.pathname.endsWith('/runnergroups/')) {
        return jsonResponse({
          count: 1,
          value: [{ id: 8, name: 'default', size: 0, isDefaultGroup: true }],
        });
      }
      if (url.pathname.endsWith('/generatejitconfig')) {
        return jsonResponse({
          runner: { id: 71, name: 'runner-71', runnerScaleSetId: 42 },
          encodedJITConfig: 'encoded-jit',
        });
      }
      if (init.method === 'GET' && url.pathname.endsWith('/agents/71')) {
        return jsonResponse({ id: 71, name: 'runner-71', runnerScaleSetId: 42 });
      }
      if (init.method === 'GET' && url.pathname.endsWith('/agents')) {
        return jsonResponse({
          count: 1,
          value: [{ id: 71, name: 'runner-71', runnerScaleSetId: 42 }],
        });
      }
      if (init.method === 'DELETE' && url.pathname.endsWith('/agents/71')) {
        return new Response(null, { status: 204 });
      }
      return new Response(null, { status: 500 });
    });

    await expect(fixture.client.getRunnerGroupByName('default')).resolves.toMatchObject({ id: 8 });
    await expect(
      fixture.client.generateJitRunnerConfig({ name: 'runner-71', workFolder: '_work' }, 42),
    ).resolves.toEqual({
      runner: { id: 71, name: 'runner-71', runnerScaleSetId: 42 },
      encodedJITConfig: 'encoded-jit',
    });
    await expect(fixture.client.getRunner(71)).resolves.toMatchObject({ id: 71 });
    await expect(fixture.client.getRunnerByName('runner-71')).resolves.toMatchObject({ id: 71 });
    await expect(fixture.client.removeRunner(71)).resolves.toBeUndefined();

    expect(fixture.serviceRequests.map(({ url, init }) => [init.method, url.pathname])).toEqual([
      ['GET', '/tenant/123/_apis/runtime/runnergroups/'],
      ['POST', '/tenant/123/_apis/runtime/runnerscalesets/42/generatejitconfig'],
      ['GET', '/tenant/123/_apis/distributedtask/pools/0/agents/71'],
      ['GET', '/tenant/123/_apis/distributedtask/pools/0/agents'],
      ['DELETE', '/tenant/123/_apis/distributedtask/pools/0/agents/71'],
    ]);
    expect(fixture.serviceRequests[0].url.searchParams.get('groupName')).toBe('default');
    expect(fixture.serviceRequests[3].url.searchParams.get('agentName')).toBe('runner-71');
    expect(JSON.parse(fixture.serviceRequests[1].init.body as string)).toEqual({
      name: 'runner-71',
      workFolder: '_work',
    });
  });
});

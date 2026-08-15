import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GitHubActionsScaleSetClient } from './client';
import { HEADER_SCALE_SET_MAX_CAPACITY } from './message-session-client';
import { RunnerScaleSetStatistic, ScaleSetFetch } from './types';

type RequestInput = Parameters<ScaleSetFetch>[0];
type RequestHandler = (url: URL, init: RequestInit) => Response | Promise<Response>;

const statistics: RunnerScaleSetStatistic = {
  totalAvailableJobs: 2,
  totalAcquiredJobs: 1,
  totalAssignedJobs: 1,
  totalRunningJobs: 1,
  totalRegisteredRunners: 2,
  totalBusyRunners: 1,
  totalIdleRunners: 1,
};

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

function actionsAdminToken(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 60 * 60 })).toString('base64url');
  return `header.${payload}.signature`;
}

function sessionFixture(handler: RequestHandler) {
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const fetchImplementation = vi.fn<ScaleSetFetch>(async (input, init = {}) => {
    const url = requestUrl(input);
    if (url.pathname === '/orgs/example/actions/runners/registration-token') {
      return jsonResponse({ token: 'runner-registration-token' }, 201);
    }
    if (url.pathname === '/actions/runner-registration') {
      return jsonResponse({
        url: 'https://actions.example/tenant/123/',
        token: actionsAdminToken(),
      });
    }

    requests.push({ url, init });
    return handler(url, init);
  });
  const client = new GitHubActionsScaleSetClient({
    gitHubConfigUrl: 'https://github.com/example',
    personalAccessToken: 'github-token',
    fetch: fetchImplementation,
    systemInfo: { system: 'unit-test', subsystem: 'listener' },
  });

  return { client, fetchImplementation, requests };
}

function sessionResponse(token = 'queue-token') {
  return {
    sessionId: '11111111-1111-1111-1111-111111111111',
    ownerName: 'listener-1',
    runnerScaleSet: { id: 42, name: 'linux' },
    messageQueueUrl: 'https://queue.example/messages?existing=1',
    messageQueueAccessToken: token,
    statistics,
  };
}

describe('MessageSessionClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes the capitalized RunnerSetting returned when creating a session', async () => {
    const fixture = sessionFixture((url, init) => {
      if (url.pathname.endsWith('/runnerscalesets/42/sessions') && init.method === 'POST') {
        return jsonResponse({
          ...sessionResponse(),
          runnerScaleSet: { id: 42, name: 'linux', RunnerSetting: { disableUpdate: true } },
        });
      }
      return new Response(null, { status: 500 });
    });

    const session = await fixture.client.createMessageSessionClient(42, 'listener-1');

    expect(session.session.runnerScaleSet?.runnerSetting).toEqual({ disableUpdate: true });
    expect(session.session.runnerScaleSet).not.toHaveProperty('RunnerSetting');
  });

  it('maps a 202 poll to null and sends the queue capacity contract', async () => {
    const fixture = sessionFixture((url, init) => {
      if (url.pathname.endsWith('/runnerscalesets/42/sessions') && init.method === 'POST') {
        return jsonResponse(sessionResponse());
      }
      if (url.hostname === 'queue.example' && init.method === 'GET') {
        return new Response(null, { status: 202 });
      }
      return new Response(null, { status: 500 });
    });
    const session = await fixture.client.createMessageSessionClient(42, 'listener-1');

    await expect(session.getMessage(0, 17)).resolves.toBeNull();

    expect(session.session.statistics).toEqual(statistics);
    const queueRequest = fixture.requests.find(({ url }) => url.hostname === 'queue.example');
    expect(queueRequest).toBeDefined();
    expect(queueRequest?.url.toString()).toBe('https://queue.example/messages?existing=1');
    const headers = new Headers(queueRequest?.init.headers);
    expect(headers.get('Accept')).toBe('application/json; api-version=6.0-preview');
    expect(headers.get('Authorization')).toBe('Bearer queue-token');
    expect(headers.get(HEADER_SCALE_SET_MAX_CAPACITY)).toBe('17');
    expect(headers.get('User-Agent')).toContain('"kind":"scaleset"');
  });

  it('decodes known batched messages, ignores unknown types, acknowledges, and acquires jobs', async () => {
    const fixture = sessionFixture((url, init) => {
      if (url.pathname.endsWith('/runnerscalesets/42/sessions') && init.method === 'POST') {
        return jsonResponse(sessionResponse());
      }
      if (url.hostname === 'queue.example' && init.method === 'GET') {
        return jsonResponse({
          messageId: 19,
          messageType: 'RunnerScaleSetJobMessages',
          statistics,
          body: JSON.stringify([
            {
              messageType: 'JobAvailable',
              runnerRequestId: 501,
              acquireJobUrl: 'https://actions.example/acquire/501',
            },
            {
              messageType: 'FutureMessageType',
              runnerRequestId: 999,
            },
            {
              messageType: 'JobCompleted',
              runnerRequestId: 500,
              runnerId: 71,
              runnerName: 'runner-71',
              result: 'Succeeded',
            },
          ]),
        });
      }
      if (url.hostname === 'queue.example' && init.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith('/runnerscalesets/42/acquirejobs') && init.method === 'POST') {
        return jsonResponse({ count: 1, value: [501] });
      }
      return new Response(null, { status: 500 });
    });
    const session = await fixture.client.createMessageSessionClient(42, 'listener-1');

    const message = await session.getMessage(18, 4);
    expect(message).toMatchObject({ messageId: 19, statistics });
    expect(message?.jobAvailableMessages).toEqual([
      expect.objectContaining({ messageType: 'JobAvailable', runnerRequestId: 501 }),
    ]);
    expect(message?.jobCompletedMessages).toEqual([
      expect.objectContaining({ messageType: 'JobCompleted', runnerName: 'runner-71' }),
    ]);
    expect(message?.jobAssignedMessages).toEqual([]);
    expect(message?.jobStartedMessages).toEqual([]);

    await expect(session.deleteMessage(19)).resolves.toBeUndefined();
    await expect(session.acquireJobs([501, 999])).resolves.toEqual([501]);

    const pollRequest = fixture.requests.find(
      ({ url, init }) => url.hostname === 'queue.example' && init.method === 'GET',
    );
    expect(pollRequest?.url.searchParams.get('lastMessageId')).toBe('18');

    const ackRequest = fixture.requests.find(
      ({ url, init }) => url.hostname === 'queue.example' && init.method === 'DELETE',
    );
    expect(ackRequest?.url.pathname).toBe('/messages/19');
    expect(ackRequest?.url.searchParams.get('existing')).toBe('1');
    expect(new Headers(ackRequest?.init.headers).get('Authorization')).toBe('Bearer queue-token');

    const acquireRequest = fixture.requests.find(({ url }) => url.pathname.endsWith('/acquirejobs'));
    expect(acquireRequest?.url.pathname).toBe('/tenant/123/_apis/runtime/runnerscalesets/42/acquirejobs');
    expect(acquireRequest?.url.searchParams.get('api-version')).toBe('6.0-preview');
    expect(new Headers(acquireRequest?.init.headers).get('Authorization')).toBe('Bearer queue-token');
    expect(JSON.parse(acquireRequest?.init.body as string)).toEqual([501, 999]);
  });

  it('refreshes the message session once on a queue 401 and retries with the new token', async () => {
    let refreshCount = 0;
    let oldTokenPolls = 0;
    let newTokenPolls = 0;
    const fixture = sessionFixture((url, init) => {
      if (url.pathname.endsWith('/runnerscalesets/42/sessions') && init.method === 'POST') {
        return jsonResponse(sessionResponse('old-queue-token'));
      }
      if (url.pathname.includes('/runnerscalesets/42/sessions/') && init.method === 'PATCH') {
        refreshCount += 1;
        return jsonResponse({
          ...sessionResponse('new-queue-token'),
          runnerScaleSet: { id: 42, name: 'linux', RunnerSetting: { disableUpdate: false } },
        });
      }
      if (url.hostname === 'queue.example' && init.method === 'GET') {
        const authorization = new Headers(init.headers).get('Authorization');
        if (authorization === 'Bearer old-queue-token') {
          oldTokenPolls += 1;
          return jsonResponse({ message: 'expired' }, 401);
        }
        if (authorization === 'Bearer new-queue-token') {
          newTokenPolls += 1;
          return new Response(null, { status: 202 });
        }
      }
      return new Response(null, { status: 500 });
    });
    const session = await fixture.client.createMessageSessionClient(42, 'listener-1');

    await expect(session.getMessage(0, 10)).resolves.toBeNull();

    expect(oldTokenPolls).toBe(1);
    expect(newTokenPolls).toBe(1);
    expect(refreshCount).toBe(1);
    expect(session.session.messageQueueAccessToken).toBe('new-queue-token');
    expect(session.session.runnerScaleSet?.runnerSetting).toEqual({ disableUpdate: false });
    expect(session.session.runnerScaleSet).not.toHaveProperty('RunnerSetting');
  });
});

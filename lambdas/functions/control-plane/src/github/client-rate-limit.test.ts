import nock from 'nock';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { createOctokitClient } from './auth';
import { metricGitHubAppRateLimit } from './rate-limit';

vi.mock('./rate-limit', () => ({
  metricGitHubAppRateLimit: vi.fn(),
}));

const mockedMetric = vi.mocked(metricGitHubAppRateLimit);
const API = 'https://api.github.com';
const headers = (remaining: number) => ({
  'x-ratelimit-remaining': String(remaining),
  'x-ratelimit-limit': '5000',
});
const remainingOf = (call: unknown[]) => (call[0] as Record<string, string>)['x-ratelimit-remaining'];
const settle = () => new Promise((resolve) => setImmediate(resolve));
const INSTALLATION_TOKEN = 'ghs_installation';
const APP_JWT = 'header.payload.signature';

beforeEach(() => {
  vi.clearAllMocks();
  nock.disableNetConnect();
});

afterEach(() => {
  nock.cleanAll();
});

describe('createOctokitClient rate limit metric', () => {
  it('records one point for a plain GET', async () => {
    nock(API).get('/orgs/octo-org/actions/runners/1').reply(200, { id: 1 }, headers(4999));
    const client = await createOctokitClient(INSTALLATION_TOKEN, '', 2);

    await client.actions.getSelfHostedRunnerForOrg({ org: 'octo-org', runner_id: 1 });

    await settle();
    expect(mockedMetric).toHaveBeenCalledTimes(1);
    expect(mockedMetric).toHaveBeenCalledWith(expect.objectContaining(headers(4999)), 2);
  });

  it('records one point for each page of a paginated list', async () => {
    nock(API)
      .get('/orgs/octo-org/actions/runners')
      .query({ per_page: 1 })
      .reply(
        200,
        { total_count: 2, runners: [{ id: 1 }] },
        {
          ...headers(4998),
          link: `<${API}/orgs/octo-org/actions/runners?per_page=1&page=2>; rel="next"`,
        },
      )
      .get('/orgs/octo-org/actions/runners')
      .query({ per_page: 1, page: 2 })
      .reply(200, { total_count: 2, runners: [{ id: 2 }] }, headers(4997));
    const client = await createOctokitClient(INSTALLATION_TOKEN, '', 0);

    const runners = await client.paginate(client.actions.listSelfHostedRunnersForOrg, { org: 'octo-org', per_page: 1 });

    expect(runners).toHaveLength(2);
    await settle();
    expect(mockedMetric.mock.calls.map(remainingOf)).toEqual(['4998', '4997']);
  });

  it('records one point for each attempt of a retried request', async () => {
    nock(API)
      .get('/orgs/octo-org/actions/runners/1')
      .reply(500, { message: 'error' }, headers(4996))
      .get('/orgs/octo-org/actions/runners/1')
      .reply(200, { id: 1 }, headers(4995));
    const client = await createOctokitClient(INSTALLATION_TOKEN, '', 1);

    await client.actions.getSelfHostedRunnerForOrg({
      org: 'octo-org',
      runner_id: 1,
      request: { retries: 1, retryAfter: 0 },
    });

    await settle();
    expect(mockedMetric.mock.calls.map(remainingOf)).toEqual(['4996', '4995']);
    expect(mockedMetric.mock.calls.every((call) => call[1] === 1)).toBe(true);
  });

  it('records the headers of a failed reply and still throws', async () => {
    nock(API).get('/orgs/octo-org/actions/runners/1').reply(404, { message: 'Not Found' }, headers(4994));
    const client = await createOctokitClient(INSTALLATION_TOKEN, '', 0);

    await expect(client.actions.getSelfHostedRunnerForOrg({ org: 'octo-org', runner_id: 1 })).rejects.toMatchObject({
      status: 404,
    });
    await settle();
    expect(mockedMetric.mock.calls.map(remainingOf)).toEqual(['4994']);
  });

  it('records nothing for a reply to an app JWT, which reports the app limit', async () => {
    nock(API).get('/orgs/octo-org/installation').reply(200, { id: 7 }, headers(4900));
    const client = await createOctokitClient(APP_JWT, '', 0);

    await client.apps.getOrgInstallation({ org: 'octo-org' });

    await settle();
    expect(mockedMetric).not.toHaveBeenCalled();
  });
});

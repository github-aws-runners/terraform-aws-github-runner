import { handle } from './handler';
import check_run_event from '../../test/resources/github_check_run_event.json';

import { sendActionRequest } from '../sqs';

jest.mock('../sqs');

describe('handler', () => {
  let originalError: Console['error'];

  beforeEach(() => {
    process.env.GITHUB_APP_WEBHOOK_SECRET = 'TEST_SECRET';
    originalError = console.error;
    console.error = jest.fn();
    jest.clearAllMocks();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('returns 500 if no signature available', async () => {
    const resp = await handle({}, '');
    expect(resp).toBe(500);
  });

  it('returns 401 if signature is invalid', async () => {
    const resp = await handle({ 'X-Hub-Signature': 'bbb' }, 'aaaa');
    expect(resp).toBe(401);
  });

  it('handles check_run events', async () => {
    const resp = await handle(
      { 'X-Hub-Signature': 'sha1=4a82d2f60346e16dab3546eb3b56d8dde4d5b659', 'X-GitHub-Event': 'check_run' },
      JSON.stringify(check_run_event),
    );
    expect(resp).toBe(200);
    expect(sendActionRequest).toBeCalled();
  });

  it('does not handle other events', async () => {
    const resp = await handle(
      { 'X-Hub-Signature': 'sha1=4a82d2f60346e16dab3546eb3b56d8dde4d5b659', 'X-GitHub-Event': 'push' },
      JSON.stringify(check_run_event),
    );
    expect(resp).toBe(200);
    expect(sendActionRequest).not.toBeCalled();
  });

  it('does not handle check_run events with actions other than created', async () => {
    const event = { ...check_run_event, action: 'completed' };
    const resp = await handle(
      { 'X-Hub-Signature': 'sha1=891749859807857017f7ee56a429e8fcead6f3e1', 'X-GitHub-Event': 'push' },
      JSON.stringify(event),
    );
    expect(resp).toBe(200);
    expect(sendActionRequest).not.toBeCalled();
  });

  it('does not handle check_run events with status other than queued', async () => {
    const event = { ...check_run_event, check_run: { id: 1234, status: 'completed' } };
    const resp = await handle(
      { 'X-Hub-Signature': 'sha1=73dfae4aa56de5b038af8921b40d7a412ce7ca19', 'X-GitHub-Event': 'push' },
      JSON.stringify(event),
    );
    expect(resp).toBe(200);
    expect(sendActionRequest).not.toBeCalled();
  });
});

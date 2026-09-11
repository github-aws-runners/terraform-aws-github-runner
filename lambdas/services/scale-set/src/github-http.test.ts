const undiciMocks = vi.hoisted(() => ({
  close: vi.fn().mockResolvedValue(undefined),
  createAgent: vi.fn(),
}));

vi.mock('undici', () => ({
  Agent: class MockAgent {
    constructor(options: unknown) {
      undiciMocks.createAgent(options);
    }

    close = undiciMocks.close;
  },
}));

import type { ScaleSetFetch } from '@aws-github-runner/github-actions-scale-set';

import { createScaleSetGitHubHttp } from './github-http';

describe('scale-set GitHub HTTP isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the supplied verified fetch without changing process TLS settings', async () => {
    const original = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    const fetchImplementation = vi.fn<ScaleSetFetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const http = createScaleSetGitHubHttp(fetchImplementation);

    await http.fetch(true)('https://github.example/_apis/runtime/runnerscalesets');
    await http.close();

    expect(fetchImplementation).toHaveBeenCalledWith('https://github.example/_apis/runtime/runnerscalesets');
    expect(undiciMocks.createAgent).not.toHaveBeenCalled();
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe(original);
  });

  it('uses one scoped insecure dispatcher and closes it without mutating global TLS state', async () => {
    const original = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    const fetchImplementation = vi.fn<ScaleSetFetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const http = createScaleSetGitHubHttp(fetchImplementation);
    const first = http.fetch(false);
    const second = http.fetch(false);

    await first('https://github.example/_apis/runtime/runnerscalesets', { method: 'GET' });
    await http.close();

    expect(first).toBe(second);
    expect(undiciMocks.createAgent).toHaveBeenCalledOnce();
    expect(undiciMocks.createAgent).toHaveBeenCalledWith({ connect: { rejectUnauthorized: false } });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://github.example/_apis/runtime/runnerscalesets',
      expect.objectContaining({ method: 'GET', dispatcher: expect.anything() }),
    );
    expect(undiciMocks.close).toHaveBeenCalledOnce();
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe(original);
  });
});

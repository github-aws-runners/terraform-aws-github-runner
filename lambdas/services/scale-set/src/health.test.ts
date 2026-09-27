import { ScaleSetControllerHealth } from './health';

describe('ScaleSetControllerHealth', () => {
  it('aggregates independent readiness while reconnect heartbeats stay live', () => {
    let now = 0;
    const health = new ScaleSetControllerHealth('group', ['a', 'b'], 100, () => now);
    const a = health.reporter('a');
    const b = health.reporter('b');
    a.markSessionReady();
    b.markSessionReady();
    a.markProgress();
    b.markProgress();
    expect(health.snapshot()).toMatchObject({ state: 'ready', live: true, ready: true });

    now = 200;
    expect(health.snapshot()).toMatchObject({ state: 'degraded', live: true, ready: false });
    expect(health.snapshot().reconcilers.a).toMatchObject({ state: 'ready', live: true, ready: false });

    a.markReconnecting(new Error('outage'));
    expect(health.snapshot()).toMatchObject({ state: 'degraded', live: true, ready: false });
    expect(health.snapshot().reconcilers.a).toMatchObject({ state: 'reconnecting', live: true, ready: false });
  });

  it('contains one terminal reconciler failure while another stays ready', () => {
    const health = new ScaleSetControllerHealth('group', ['a', 'b'], 100);
    health.reporter('a').markFailed(new TypeError('bad config'));
    health.reporter('b').markProgress();
    expect(health.snapshot()).toMatchObject({ state: 'degraded', live: true, ready: false });
    expect(health.snapshot().reconcilers.a).toMatchObject({ state: 'failed', lastErrorName: 'TypeError' });
  });

  it('marks all reporters stopping without reviving failures', () => {
    const health = new ScaleSetControllerHealth('group', ['a'], 100);
    health.reporter('a').markFailed();
    health.markStopping();
    expect(health.snapshot()).toMatchObject({ state: 'stopping', live: true, ready: false });
    expect(health.snapshot().reconcilers.a.state).toBe('failed');
  });

  it('rejects duplicate and unknown reporter names', () => {
    expect(() => new ScaleSetControllerHealth('g', [], 1)).toThrow('at least one');
    expect(() => new ScaleSetControllerHealth('g', ['a', 'a'], 1)).toThrow('duplicate');
    const health = new ScaleSetControllerHealth('g', ['a'], 1);
    expect(() => health.reporter('b')).toThrow('unknown runner config');
  });
});

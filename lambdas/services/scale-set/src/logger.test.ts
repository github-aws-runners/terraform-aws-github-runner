import { createScaleSetLogger, logger, sanitizeLogAttributes } from './logger';

describe('redacted structured logging', () => {
  it('emits debug records when LOG_LEVEL is debug', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    createScaleSetLogger({ LOG_LEVEL: 'debug' }).debug('debug_event', { reconcilerCount: 2 });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"event":"debug_event"'));
    spy.mockRestore();
  });

  it('does not emit debug records at the default info level', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    createScaleSetLogger({}).debug('hidden_debug_event');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('redacts nested secrets and strips log-injection characters', () => {
    expect(
      sanitizeLogAttributes({
        runnerConfig: 'linux\nforged',
        privateKey: 'secret',
        nested: { authorization: 'Bearer secret', safe: 'ok' },
      }),
    ).toEqual({
      runnerConfig: 'linux forged',
      privateKey: '[REDACTED]',
      nested: { authorization: '[REDACTED]', safe: 'ok' },
    });
  });

  it('logs errors without their potentially sensitive message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logger.error('failed', { error: new Error('token=secret') });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).not.toContain('token=secret');
    expect(spy.mock.calls[0][0]).toContain('token=[REDACTED]');
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ level: 'error', event: 'failed' });
    spy.mockRestore();
  });

  it('includes generic error messages without provider-specific error handling', () => {
    expect(sanitizeLogAttributes({ error: new Error('invalid scale-set configuration') })).toEqual({
      error: {
        name: 'Error',
        message: 'invalid scale-set configuration',
      },
    });
  });
});

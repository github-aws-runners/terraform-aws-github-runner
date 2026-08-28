import { logger, sanitizeLogAttributes } from './logger';
import { ScaleSetConfigurationError } from './config';

describe('redacted structured logging', () => {
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
    expect(JSON.parse(spy.mock.calls[0][0] as string)).toMatchObject({ level: 'error', event: 'failed' });
    spy.mockRestore();
  });

  it('includes safe configuration error messages for diagnosis', () => {
    expect(
      sanitizeLogAttributes({
        error: new ScaleSetConfigurationError(
          'provide exactly one of SCALE_SET_CONTROLLER_MANIFEST or SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH',
        ),
      }),
    ).toEqual({
      error: {
        name: 'ScaleSetConfigurationError',
        message: 'provide exactly one of SCALE_SET_CONTROLLER_MANIFEST or SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH',
      },
    });
  });
});

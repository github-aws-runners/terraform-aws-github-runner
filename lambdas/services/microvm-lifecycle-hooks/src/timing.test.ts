import { beforeDeadlineOrAbort, delay } from './timing';

describe('timing helpers', () => {
  it('removes the delay abort listener after resolving', async () => {
    const signal = new AbortController().signal;
    const remove = vi.spyOn(signal, 'removeEventListener');

    await delay(1, signal);

    expect(remove).toHaveBeenCalledOnce();
  });

  it('removes the delay abort listener after cancellation', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = delay(1_000, controller.signal);

    controller.abort();

    await expect(pending).rejects.toThrow('operation was cancelled');
    expect(remove).toHaveBeenCalledOnce();
  });

  it('rejects immediately when an operation is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      beforeDeadlineOrAbort(Promise.resolve('unused'), Date.now() + 1_000, controller.signal),
    ).rejects.toThrow('runner start was cancelled');
  });
});

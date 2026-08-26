import type { ScaleSetServiceConfig } from './config';
import type { ScaleSetController } from './controller';

export class ScaleSetServiceRuntime {
  private readonly abortController = new AbortController();
  private completion: Promise<void> | undefined;
  private shutdownCompletion: Promise<void> | undefined;

  constructor(
    private readonly config: Pick<ScaleSetServiceConfig, 'shutdownTimeoutMs'>,
    private readonly controller: Pick<ScaleSetController, 'run' | 'health'>,
  ) {}

  get health() {
    return this.controller.health;
  }

  run(): Promise<void> {
    if (this.shutdownCompletion !== undefined) throw new Error('Scale-set service runtime is already stopping');
    if (this.completion !== undefined) throw new Error('Scale-set service runtime has already started');
    this.completion = Promise.resolve().then(async () => {
      if (!this.abortController.signal.aborted) await this.controller.run(this.abortController.signal);
    });
    return this.completion;
  }

  shutdown(reason: unknown = new Error('Scale-set service shutdown requested')): Promise<void> {
    this.shutdownCompletion ??= this.shutdownOnce(reason);
    return this.shutdownCompletion;
  }

  private async shutdownOnce(reason: unknown): Promise<void> {
    this.controller.health.markStopping();
    this.abortController.abort(reason);
    if (this.completion === undefined) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.completion,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Scale-set controller did not stop within ${this.config.shutdownTimeoutMs}ms`)),
            this.config.shutdownTimeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
}

import type { ScaleSetControllerManifest, ScaleSetServiceConfig } from './config';
import { ScaleSetControllerHealth } from './health';
import type { ScaleSetLogger } from './logger';
import { ScaleSetReconciler, type ScaleSetReconcilerDependencies } from './reconciler';

export class ScaleSetController {
  readonly health: ScaleSetControllerHealth;

  constructor(
    private readonly manifest: ScaleSetControllerManifest,
    private readonly serviceConfig: ScaleSetServiceConfig,
    private readonly dependencies: ScaleSetReconcilerDependencies,
    private readonly controllerLogger: ScaleSetLogger,
  ) {
    this.health = new ScaleSetControllerHealth(
      manifest.groupName,
      manifest.reconcilers.map(({ runnerConfigName }) => runnerConfigName),
      serviceConfig.healthStaleAfterMs,
    );
  }

  async run(signal: AbortSignal): Promise<void> {
    this.controllerLogger.debug('scale_set_reconcilers_starting', {
      reconcilerCount: this.manifest.reconcilers.length,
      runnerConfigNames: this.manifest.reconcilers.map(({ runnerConfigName }) => runnerConfigName),
    });
    const completions = this.manifest.reconcilers.map(async (config) => {
      const status = this.health.reporter(config.runnerConfigName);
      try {
        await new ScaleSetReconciler(config, this.serviceConfig, this.dependencies).run(signal, status);
      } catch (error) {
        status.markFailed(error);
        this.controllerLogger.error('scale_set_reconciler_uncaught_failure', {
          runnerConfigName: config.runnerConfigName,
          scaleSetId: config.scaleSetId,
          error,
        });
      }
    });

    await Promise.race([Promise.all(completions), waitForAbort(signal)]);
    if (!signal.aborted) await waitForAbort(signal);
    this.health.markStopping();
    await Promise.all(completions);
  }
}

async function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }));
}

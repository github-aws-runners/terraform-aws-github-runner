import { createChildLogger } from '@aws-github-runner/aws-powertools-util';

import {
  createScaleSetListenerDependencies,
  loadScaleSetListenerConfig,
  runScaleSetListener,
  ScaleSetListenerHealth,
  startScaleSetHealthServer,
  type ScaleSetHealthServer,
} from './ecs-listener';

const logger = createChildLogger('scale-set-ecs-listener-main');

async function main(): Promise<void> {
  const abortController = new AbortController();
  let health: ScaleSetListenerHealth | undefined;
  let healthServer: ScaleSetHealthServer | undefined;

  const onSignal = (signal: NodeJS.Signals) => {
    logger.info('Received container shutdown signal', { signal });
    health?.markStopping();
    abortController.abort(new Error(`Received ${signal}`));
  };
  const onSigterm = () => onSignal('SIGTERM');
  const onSigint = () => onSignal('SIGINT');
  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);

  try {
    const config = loadScaleSetListenerConfig();
    health = new ScaleSetListenerHealth(config.healthStaleMs);
    healthServer = await startScaleSetHealthServer(health, config.healthPort);
    logger.info('Starting ECS GitHub scale-set listener', {
      scaleSetId: config.orchestrator.scaleSetId,
      sessionOwner: config.sessionOwner,
      githubScope: config.githubConfig.scope,
      healthPort: healthServer.port,
    });

    await runScaleSetListener(config, abortController.signal, createScaleSetListenerDependencies(health));
  } finally {
    health?.markStopping();
    await healthServer?.close();
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('SIGINT', onSigint);
  }
}

void main().catch((error) => {
  logger.error('Fatal ECS scale-set listener failure', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});

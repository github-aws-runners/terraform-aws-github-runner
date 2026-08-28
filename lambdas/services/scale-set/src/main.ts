import { GitHubActionsScaleSetClient } from '@aws-github-runner/github-actions-scale-set';
import { createScaleSetComputeProviderRegistry } from '@aws-github-runner/compute-providers/scale-set';

import { parseScaleSetServiceConfig } from './config';
import { ScaleSetController } from './controller';
import { createGitHubAppAccessTokenProvider } from './credentials';
import { createScaleSetGitHubHttp } from './github-http';
import { startScaleSetHealthServer, type ScaleSetHealthServer } from './health-server';
import { ScaleSetServiceRuntime } from './lifecycle';
import { logger } from './logger';
import { createDefaultControllerManifestLoader, defaultParameterStore } from './parameter-store';
import { abortableSleep, TtlScaleSetRunnerInventoryCache, type ScaleSetReconcilerDependencies } from './reconciler';

async function main(): Promise<void> {
  logger.info('scale_set_controller_configuration_loading', {
    manifestConfigured: Boolean(process.env.SCALE_SET_CONTROLLER_MANIFEST?.trim()),
    groupConfigConfigured: Boolean(process.env.SCALE_SET_CONTROLLER_GROUP_CONFIG_PATH?.trim()),
  });
  const serviceConfig = parseScaleSetServiceConfig(process.env);
  const manifest = await createDefaultControllerManifestLoader().load(serviceConfig);
  logger.info('scale_set_controller_manifest_loaded', {
    groupName: manifest.groupName,
    revision: manifest.revision,
    reconcilerCount: manifest.reconcilers.length,
    runnerConfigNames: manifest.reconcilers.map(({ runnerConfigName }) => runnerConfigName),
  });
  const computeProviders = createScaleSetComputeProviderRegistry();
  const githubHttp = createScaleSetGitHubHttp();
  const dependencies: ScaleSetReconcilerDependencies = {
    computeProviders,
    createAccessTokenProvider: async (config) =>
      await createGitHubAppAccessTokenProvider(
        config.githubApp,
        config.githubConfigUrl,
        config.forceGhes,
        defaultParameterStore,
        githubHttp.fetch(config.sslVerify),
      ),
    createClient: (config, accessTokenProvider) =>
      new GitHubActionsScaleSetClient({
        gitHubConfigUrl: config.githubConfigUrl,
        accessTokenProvider,
        fetch: githubHttp.fetch(config.sslVerify),
        forceGhes: config.forceGhes,
        systemInfo: {
          system: config.userAgent ?? 'github-aws-runners',
          version: '1',
          scaleSetId: config.scaleSetId ?? 0,
          subsystem: 'scale-set-controller',
        },
      }),
    logger,
    parameterStore: defaultParameterStore,
    sleep: abortableSleep,
    random: Math.random,
    closeSignal: AbortSignal.timeout,
    runnerInventory: new TtlScaleSetRunnerInventoryCache(),
  };
  const controller = new ScaleSetController(manifest, serviceConfig, dependencies, logger);
  const runtime = new ScaleSetServiceRuntime(serviceConfig, controller);
  let healthServer: ScaleSetHealthServer | undefined;

  const shutdown = (signal: NodeJS.Signals) => {
    logger.info('scale_set_controller_shutdown_requested', { signal, groupName: manifest.groupName });
    void runtime.shutdown(new Error(`received ${signal}`)).catch((error) => {
      logger.error('scale_set_controller_shutdown_failed', { error, groupName: manifest.groupName });
      process.exitCode = 1;
    });
  };
  const onSigterm = () => shutdown('SIGTERM');
  const onSigint = () => shutdown('SIGINT');
  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);

  try {
    healthServer = await startScaleSetHealthServer(runtime.health, serviceConfig.healthPort);
    logger.info('scale_set_controller_started', {
      groupName: manifest.groupName,
      revision: manifest.revision,
      reconcilerCount: manifest.reconcilers.length,
      healthPort: healthServer.port,
    });
    await runtime.run();
  } finally {
    await runtime.shutdown().catch(() => undefined);
    await healthServer?.close();
    await githubHttp.close();
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('SIGINT', onSigint);
  }
}

void main().catch((error) => {
  logger.error('scale_set_controller_fatal_failure', { error });
  process.exitCode = 1;
});

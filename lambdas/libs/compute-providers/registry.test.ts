import { expect, it, vi } from 'vitest';

import { createControlPlaneProviderRegistry } from './control-plane';
import { computeProviderTypes } from './provider-types';
import { enabledControlPlaneProviders } from './providers.config.control-plane';
import { enabledWebhookProviders } from './providers.config.webhook';
import { webhookProviderRegistry } from './webhook';

it('exposes every configured provider through both capability registries', () => {
  const createStartRunnerConfig = vi.fn(async () => []);
  const controlPlaneRegistry = createControlPlaneProviderRegistry(createStartRunnerConfig);
  const controlPlaneTypes = enabledControlPlaneProviders.map(({ type }) => type);
  const webhookTypes = enabledWebhookProviders.map(({ type }) => type);

  expect(controlPlaneTypes).toEqual(computeProviderTypes);
  expect(webhookTypes).toEqual(computeProviderTypes);

  for (const type of computeProviderTypes) {
    const pool = controlPlaneRegistry.capability(type, 'pool')();
    expect(pool).toEqual({
      listRunners: expect.any(Function),
      countAvailableRunners: expect.any(Function),
      createRunners: expect.any(Function),
      ...(pool.standby && {
        standby: expect.objectContaining({
          list: expect.any(Function),
          launch: expect.any(Function),
          destroy: expect.any(Function),
        }),
      }),
    });
    expect(controlPlaneRegistry.capability(type, 'scaleUp')()).toEqual({
      resolveLabelsForRunners: expect.any(Function),
      getCurrentRunners: expect.any(Function),
      createRunners: expect.any(Function),
    });
    const scaleDown = controlPlaneRegistry.capability(type, 'scaleDown')();
    expect(scaleDown).toEqual({
      list: expect.any(Function),
      bootTimeExceeded: expect.any(Function),
      markOrphan: expect.any(Function),
      unmarkOrphan: expect.any(Function),
      markIdle: expect.any(Function),
      unmarkIdle: expect.any(Function),
      terminate: expect.any(Function),
      ...(scaleDown.sweepStandby && { sweepStandby: expect.any(Function) }),
    });
    expect(webhookProviderRegistry.capability(type, 'dynamicLabels').getViolations).toEqual(expect.any(Function));
  }

  expect(controlPlaneRegistry.capability('ec2', 'pool')().standby).toEqual({
    list: expect.any(Function),
    launch: expect.any(Function),
    destroy: expect.any(Function),
    cancelSpotRequests: expect.any(Function),
    currentImage: expect.any(Function),
  });
  expect(controlPlaneRegistry.capability('ec2', 'scaleDown')().sweepStandby).toEqual(expect.any(Function));
});

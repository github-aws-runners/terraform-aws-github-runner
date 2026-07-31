import { expect, it, vi } from 'vitest';

import { provider } from './index';

it('exposes every runner provider capability from one module', () => {
  const controlPlanePlugin = provider.createControlPlanePlugin(vi.fn(async () => []));
  const pool = controlPlanePlugin.capabilities.pool();
  const scaleUp = controlPlanePlugin.capabilities.scaleUp();
  const scaleDown = controlPlanePlugin.capabilities.scaleDown();
  const webhookPlugin = provider.createWebhookPlugin();

  expect(controlPlanePlugin.type).toBe(provider.type);
  expect(pool).toEqual({
    listRunners: expect.any(Function),
    countAvailableRunners: expect.any(Function),
    createRunners: expect.any(Function),
  });
  expect(scaleUp).toEqual({
    prepareGroup: expect.any(Function),
    getCurrentRunners: expect.any(Function),
    createRunners: expect.any(Function),
  });
  expect(scaleDown).toEqual({
    list: expect.any(Function),
    bootTimeExceeded: expect.any(Function),
    markOrphan: expect.any(Function),
    unmarkOrphan: expect.any(Function),
    terminate: expect.any(Function),
  });
  expect(webhookPlugin.type).toBe(provider.type);
  expect(webhookPlugin.capabilities.dynamicLabels.selectQueue).toEqual(expect.any(Function));
});

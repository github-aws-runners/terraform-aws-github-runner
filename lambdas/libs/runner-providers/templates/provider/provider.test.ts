import { expect, it, vi } from 'vitest';

import { provider as controlPlaneProvider } from './control-plane';
import { provider as webhookProvider } from './webhook';

it('exposes every runner provider capability from its lane entry point', () => {
  const controlPlanePlugin = controlPlaneProvider.createPlugin(vi.fn(async () => []));
  const pool = controlPlanePlugin.capabilities.pool();
  const scaleUp = controlPlanePlugin.capabilities.scaleUp();
  const scaleDown = controlPlanePlugin.capabilities.scaleDown();
  const webhookPlugin = webhookProvider.createPlugin();

  expect(controlPlanePlugin.type).toBe(controlPlaneProvider.type);
  expect(pool).toEqual({
    listRunners: expect.any(Function),
    countAvailableRunners: expect.any(Function),
    createRunners: expect.any(Function),
  });
  expect(scaleUp).toEqual({
    resolveLabelsForRunners: expect.any(Function),
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
  expect(webhookPlugin.type).toBe(webhookProvider.type);
  expect(webhookPlugin.capabilities.dynamicLabels.selectQueue).toEqual(expect.any(Function));
});

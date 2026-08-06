import { expect, it, vi } from 'vitest';

import { provider as controlPlaneProvider } from './control-plane';
import { provider as webhookProvider } from './webhook';

it('exposes every MicroVM compute provider capability from its compute-provider entry point', () => {
  const controlPlanePlugin = controlPlaneProvider.createPlugin(vi.fn(async () => []));
  const webhookPlugin = webhookProvider.createPlugin();

  expect(controlPlanePlugin.type).toBe('microvm');
  expect(controlPlanePlugin.capabilities.pool()).toEqual({
    listRunners: expect.any(Function),
    countAvailableRunners: expect.any(Function),
    createRunners: expect.any(Function),
  });
  expect(controlPlanePlugin.capabilities.scaleUp()).toEqual({
    resolveLabelsForRunners: expect.any(Function),
    getCurrentRunners: expect.any(Function),
    createRunners: expect.any(Function),
  });
  expect(controlPlanePlugin.capabilities.scaleDown()).toEqual({
    list: expect.any(Function),
    bootTimeExceeded: expect.any(Function),
    markOrphan: expect.any(Function),
    unmarkOrphan: expect.any(Function),
    terminate: expect.any(Function),
  });
  expect(webhookPlugin.type).toBe('microvm');
  expect(webhookPlugin.capabilities.dynamicLabels.getViolations).toEqual(expect.any(Function));
});

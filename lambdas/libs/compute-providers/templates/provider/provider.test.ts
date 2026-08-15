import { expect, it, vi } from 'vitest';

import { provider as controlPlaneProvider } from './control-plane';
import { provider as scaleSetProvider } from './scale-set';
import { provider as webhookProvider } from './webhook';

it('exposes every compute provider capability from its compute-provider entry point', () => {
  const controlPlanePlugin = controlPlaneProvider.createPlugin(vi.fn(async () => []));
  const pool = controlPlanePlugin.capabilities.pool();
  const scaleUp = controlPlanePlugin.capabilities.scaleUp();
  const scaleDown = controlPlanePlugin.capabilities.scaleDown();
  const scaleSetPlugin = scaleSetProvider.createPlugin();
  const scaleSet = scaleSetPlugin.capabilities.scaleSet();
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
  expect(controlPlanePlugin.capabilities).not.toHaveProperty('scaleSet');
  expect(scaleSetPlugin.type).toBe(scaleSetProvider.type);
  expect(scaleSet).toEqual({
    getCurrentRunners: expect.any(Function),
    createRunners: expect.any(Function),
    terminateSurplusRunners: expect.any(Function),
    markRunnerStarted: expect.any(Function),
    terminateCompletedRunner: expect.any(Function),
  });
  expect(webhookPlugin.type).toBe(webhookProvider.type);
  expect(webhookPlugin.capabilities.dynamicLabels.getViolations).toEqual(expect.any(Function));
});

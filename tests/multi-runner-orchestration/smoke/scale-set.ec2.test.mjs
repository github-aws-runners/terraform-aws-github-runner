import assert from 'node:assert/strict';
import { registerScaleSetLifecycleTest } from './scale-set-support.mjs';

registerScaleSetLifecycleTest({
  providerName: 'EC2',
  verifyBaseline: (event) => assert.equal(
    event.currentRunners,
    0,
    'Scale-set baseline should have no runners',
  ),
  verifyScaleUp: (event) => {
    assert.ok(event.actions?.launched > 0, 'EC2 scale-set scale-up did not launch a runner');
    assert.equal(event.currentRunners, 1, 'EC2 scale-set scale-up did not reach one runner');
  },
  verifyScaleDown: (event) => {
    assert.ok(event.actions?.terminated > 0, 'EC2 scale-set scale-down did not terminate a runner');
    assert.equal(event.currentRunners, 0, 'EC2 scale-set scale-down did not return to zero runners');
  },
});

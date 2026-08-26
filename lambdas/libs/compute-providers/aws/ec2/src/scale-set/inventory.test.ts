import { createHash } from 'node:crypto';

import { CreateFleetCommand, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { beforeEach, describe, expect, it } from 'vitest';

import { EC2_GITHUB_SCOPE_HASH_TAG, EC2_RUNNER_CONFIG_TAG, EC2_SCALE_SET_ID_TAG } from './inventory';
import { createRequest, githubScopeHash, githubState, ownedInstance } from './test/fixtures';
import { createTestProvider, ec2Mock, resetAwsMocks } from './test/provider-harness';

beforeEach(resetAwsMocks);

describe('EC2 scale-set inventory', () => {
  it('lists only the exact runner-config and scale-set ownership boundary', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [
        {
          Instances: [
            ownedInstance('i-owned', { runnerId: 101, runnerName: 'runner-i-owned' }),
            ownedInstance('i-other', undefined, { runnerConfigName: 'other' }),
            ownedInstance(
              'i-other-scope',
              { runnerId: 102, runnerName: 'runner-i-other-scope' },
              {
                githubScopeHash: createHash('sha256').update('https://github.com/another', 'utf8').digest('hex'),
              },
            ),
          ],
        },
      ],
    });

    const result = await createTestProvider().reconcile(createRequest());

    expect(result).toMatchObject({ status: 'converged', desiredRunners: 1, currentRunners: 1 });
    expect(ec2Mock).toHaveReceivedCommandWith(DescribeInstancesCommand, {
      Filters: expect.arrayContaining([
        { Name: 'tag:ghr:Application', Values: ['github-action-runner'] },
        { Name: 'tag:ghr:created_by', Values: ['scale-set-service'] },
        { Name: 'tag:ghr:environment', Values: ['unit-test'] },
        { Name: `tag:${EC2_RUNNER_CONFIG_TAG}`, Values: ['linux'] },
        { Name: `tag:${EC2_SCALE_SET_ID_TAG}`, Values: ['42'] },
        { Name: `tag:${EC2_GITHUB_SCOPE_HASH_TAG}`, Values: [githubScopeHash] },
      ]),
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);
  });

  it('counts a young handed-off instance as serving during its bounded boot window', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [
        {
          Instances: [ownedInstance('i-booting', { runnerId: 101, runnerName: 'runner-i-booting' })],
        },
      ],
    });

    const result = await createTestProvider({ now: () => new Date('2026-08-24T10:09:59Z').getTime() }).reconcile(
      createRequest(),
    );

    expect(result).toMatchObject({
      status: 'converged',
      currentRunners: 1,
      needsRunnerInventory: false,
      actions: { launched: 0, retainedUnknown: 0 },
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);
  });

  it('uses the orchestration request boot window instead of provider configuration', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [
        {
          Instances: [ownedInstance('i-at-timeout', { runnerId: 101, runnerName: 'runner-i-at-timeout' })],
        },
      ],
    });

    const result = await createTestProvider({ now: () => new Date('2026-08-24T10:05:00Z').getTime() }).reconcile(
      createRequest({ bootTimeoutMinutes: 5 }),
    );

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      needsRunnerInventory: true,
      actions: { launched: 0, retainedUnknown: 1 },
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);
  });

  it('requests a complete inventory for an old handoff, then counts only its exact online identity', async () => {
    const instance = ownedInstance('i-old', { runnerId: 101, runnerName: 'runner-i-old' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const computeProvider = createTestProvider({ now: () => new Date('2026-08-24T10:10:00Z').getTime() });

    const firstPass = await computeProvider.reconcile(createRequest());

    expect(firstPass).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      needsRunnerInventory: true,
      actions: { launched: 0, retainedUnknown: 1 },
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);

    const secondPass = await computeProvider.reconcile(
      createRequest({
        runnerInventoryComplete: true,
        runnerStates: [githubState(101, 'runner-i-old', { status: 'online', lifecycle: 'unknown' })],
      }),
    );

    expect(secondPass).toMatchObject({
      status: 'converged',
      currentRunners: 1,
      needsRunnerInventory: false,
      actions: { launched: 0, retainedUnknown: 0 },
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);
  });

  it('counts an exact JobStarted identity as serving without waiting for public inventory', async () => {
    const instance = ownedInstance('i-started', { runnerId: 101, runnerName: 'runner-i-started' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });

    const result = await createTestProvider({ now: () => new Date('2026-08-24T12:00:00Z').getTime() }).reconcile(
      createRequest({
        runnerStates: [
          githubState(101, 'runner-i-started', { status: 'unknown', busy: undefined, lifecycle: 'started' }),
        ],
      }),
    );

    expect(result).toMatchObject({
      status: 'converged',
      currentRunners: 1,
      needsRunnerInventory: false,
      actions: { launched: 0, retainedUnknown: 0 },
    });
  });
});

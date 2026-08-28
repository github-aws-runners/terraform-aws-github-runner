import { DescribeInstancesCommand, TerminateInstancesCommand } from '@aws-sdk/client-ec2';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequest, githubState, ownedInstance, signal } from './test/fixtures';
import { createTestProvider, ec2Mock, resetAwsMocks } from './test/provider-harness';

beforeEach(resetAwsMocks);

describe('EC2 scale-set scale down', () => {
  it('terminates only exact known-idle or completed runners and retains busy or unknown runners', async () => {
    const completed = ownedInstance('i-completed', { runnerId: 101, runnerName: 'runner-completed' });
    const busy = ownedInstance('i-busy', { runnerId: 102, runnerName: 'runner-busy' });
    const unknown = ownedInstance('i-unknown', { runnerId: 103, runnerName: 'runner-unknown' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [completed, busy, unknown] }] });
    const removeRunner = vi.fn().mockResolvedValue({ status: 'removed' });

    const result = await createTestProvider().reconcile(
      createRequest({
        desiredRunners: 2,
        runnerStates: [
          githubState(101, 'runner-completed', { status: 'offline', busy: undefined, lifecycle: 'completed' }),
          githubState(102, 'runner-busy', { busy: true, lifecycle: 'started' }),
        ],
        removeRunner,
      }),
    );

    expect(result).toEqual({
      status: 'converged',
      desiredRunners: 2,
      currentRunners: 2,
      actions: { launched: 0, terminated: 1, retainedBusy: 1, retainedUnknown: 0 },
      errors: [],
    });
    expect(removeRunner).toHaveBeenCalledTimes(1);
    expect(removeRunner).toHaveBeenCalledWith({
      runnerId: 101,
      runnerName: 'runner-completed',
      scaleSetId: 42,
      signal,
    });
    expect(ec2Mock).toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-completed'] });
    expect(ec2Mock).not.toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-busy'] });
    expect(ec2Mock).not.toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-unknown'] });
  });

  it('uses aggregate idle state to remove a tagged runner after a restart', async () => {
    const instance = ownedInstance('i-completed', { runnerId: 101, runnerName: 'runner-completed' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi.fn().mockResolvedValue({ status: 'removed' });
    const result = await createTestProvider().reconcile(
      createRequest({ desiredRunners: 0, busyRunners: 0, runnerStates: [], removeRunner }),
    );

    expect(result).toMatchObject({
      status: 'converged',
      currentRunners: 0,
      actions: { terminated: 1 },
    });
    expect(removeRunner).toHaveBeenCalledTimes(1);
  });

  it('never lets a completed lifecycle marker override a current busy signal', async () => {
    const instance = ownedInstance('i-completed-busy', { runnerId: 101, runnerName: 'runner-completed-busy' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi.fn();

    const result = await createTestProvider().reconcile(
      createRequest({
        desiredRunners: 0,
        busyRunners: 1,
        runnerStates: [
          githubState(101, 'runner-completed-busy', {
            lifecycle: 'completed',
            status: 'online',
            busy: true,
          }),
        ],
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      actions: { terminated: 0, retainedBusy: 1 },
      errors: [],
    });
    expect(removeRunner).not.toHaveBeenCalled();
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('retains a runner without an error when the exact removal check observes that it became busy', async () => {
    const instance = ownedInstance('i-raced-busy', { runnerId: 101, runnerName: 'runner-raced-busy' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi.fn().mockResolvedValue({ status: 'retained_busy' });

    const result = await createTestProvider().reconcile(
      createRequest({
        desiredRunners: 0,
        busyRunners: 0,
        runnerStates: [githubState(101, 'runner-raced-busy')],
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      actions: { terminated: 0, retainedBusy: 1, retainedUnknown: 0 },
      errors: [],
    });
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('retains a runner and requests inventory when exact removal observes identity drift', async () => {
    const instance = ownedInstance('i-raced-unknown', { runnerId: 101, runnerName: 'runner-raced-unknown' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi.fn().mockResolvedValue({ status: 'retained_unknown' });

    const result = await createTestProvider().reconcile(
      createRequest({
        desiredRunners: 0,
        busyRunners: 0,
        runnerStates: [githubState(101, 'runner-raced-unknown')],
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      actions: { terminated: 0, retainedBusy: 0, retainedUnknown: 1 },
      errors: [],
    });
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('does not trust a mutable EC2 GitHub-runner-id tag when controller identity disagrees', async () => {
    const instance = ownedInstance('i-mismatch', { runnerId: 999, runnerName: 'runner-exact' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi.fn();

    const result = await createTestProvider().reconcile(
      createRequest({
        desiredRunners: 0,
        busyRunners: 0,
        runnerStates: [githubState(101, 'runner-exact')],
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 1,
      actions: { terminated: 0, retainedUnknown: 1 },
      errors: [],
    });
    expect(removeRunner).not.toHaveBeenCalled();
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('does not terminate compute when exact GitHub removal fails', async () => {
    const instance = ownedInstance('i-idle', { runnerId: 101, runnerName: 'runner-idle' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [instance] }] });
    const removeRunner = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('must not leak'), { name: 'ServiceUnavailable' }));

    const result = await createTestProvider().reconcile(
      createRequest({
        desiredRunners: 0,
        busyRunners: 0,
        runnerStates: [githubState(101, 'runner-idle')],
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'error',
      currentRunners: 1,
      actions: { terminated: 0, retainedUnknown: 1 },
    });
    expect(result.errors).toEqual([
      {
        operation: 'remove_runner',
        code: 'ServiceUnavailable',
        runnerName: 'runner-idle',
        resourceId: 'i-idle',
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('must not leak');
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });
});

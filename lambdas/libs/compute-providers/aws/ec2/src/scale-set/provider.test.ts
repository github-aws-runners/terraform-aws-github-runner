import { CreateFleetCommand, DescribeInstancesCommand, TerminateInstancesCommand } from '@aws-sdk/client-ec2';
import { PutParameterCommand } from '@aws-sdk/client-ssm';
import { beforeEach, describe, expect, it } from 'vitest';

import { config, createRequest, githubState, ownedInstance } from './test/fixtures';
import { createTestProvider, ec2Mock, resetAwsMocks, ssmMock } from './test/provider-harness';

beforeEach(resetAwsMocks);

describe('EC2 scale-set provider orchestration', () => {
  it('rejects non-canonical GitHub ownership scopes before creating clients', () => {
    expect(() => createTestProvider({ githubScope: 'https://GITHUB.com/example/' })).toThrow(
      'githubScope must be a canonical HTTPS GitHub configuration URL',
    );
  });

  it('retains an old offline handoff and bounds replacement to one physical surge instance', async () => {
    const old = ownedInstance('i-old-offline', { runnerId: 100, runnerName: 'runner-i-old-offline' });
    const replacementId = 'i-1234567890abcdef0';
    const replacement = ownedInstance(
      replacementId,
      { runnerId: 101, runnerName: `runner-${replacementId}` },
      {
        launchTime: new Date('2026-08-24T10:10:30Z'),
      },
    );
    ec2Mock
      .on(DescribeInstancesCommand)
      .resolvesOnce({ Reservations: [{ Instances: [old] }] })
      .resolves({ Reservations: [{ Instances: [old, replacement] }] });
    ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [replacementId] }] });
    const computeProvider = createTestProvider({ now: () => new Date('2026-08-24T10:11:00Z').getTime() });
    const completeInventory = createRequest({
      runnerInventoryComplete: true,
      runnerStates: [
        githubState(100, 'runner-i-old-offline', {
          status: 'offline',
          busy: false,
          lifecycle: 'completed',
        }),
      ],
    });

    const result = await computeProvider.reconcile(completeInventory);
    const nextResult = await computeProvider.reconcile(completeInventory);

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 2,
      needsRunnerInventory: false,
      actions: { launched: 1, retainedUnknown: 1 },
    });
    expect(nextResult).toMatchObject({
      status: 'retained',
      currentRunners: 2,
      needsRunnerInventory: false,
      actions: { launched: 0, retainedUnknown: 1 },
    });
    expect(ec2Mock).toHaveReceivedCommandTimes(CreateFleetCommand, 1);
  });

  it.each(['provisioning', 'publishing'])(
    'retains interrupted %s capacity but provisions a replacement',
    async (scaleSetState) => {
      const stuck = ownedInstance(
        'i-stuck',
        scaleSetState === 'publishing' ? { runnerId: 100, runnerName: 'runner-i-stuck' } : undefined,
        { scaleSetState },
      );
      const replacement = 'i-1234567890abcdef0';
      ec2Mock
        .on(DescribeInstancesCommand)
        .resolvesOnce({ Reservations: [{ Instances: [stuck] }] })
        .resolves({
          Reservations: [
            {
              Instances: [stuck, ownedInstance(replacement, { runnerId: 101, runnerName: `runner-${replacement}` })],
            },
          ],
        });
      ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [replacement] }] });
      const computeProvider = createTestProvider();

      const result = await computeProvider.reconcile(createRequest());

      expect(result).toMatchObject({
        status: 'retained',
        currentRunners: 2,
        actions: { launched: 1, terminated: 0, retainedUnknown: 1 },
        errors: [],
      });
      expect(ec2Mock).not.toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-stuck'] });
      expect(ssmMock).toHaveReceivedCommandWith(PutParameterCommand, {
        Name: `${config.jitConfigParameterPath}/${replacement}`,
      });

      const nextResult = await computeProvider.reconcile(createRequest());
      expect(nextResult).toMatchObject({
        status: 'retained',
        currentRunners: 2,
        actions: { launched: 0, terminated: 0, retainedUnknown: 1 },
        errors: [],
      });
      expect(ec2Mock).toHaveReceivedCommandTimes(CreateFleetCommand, 1);
    },
  );

  it('caps retained-capacity replacement surge when every replacement remains ambiguous', async () => {
    const ambiguous = [
      ownedInstance('i-stuck-1', undefined, { scaleSetState: 'provisioning' }),
      ownedInstance('i-stuck-2', { runnerId: 102, runnerName: 'runner-i-stuck-2' }, { scaleSetState: 'publishing' }),
    ];
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: ambiguous }] });

    const result = await createTestProvider().reconcile(createRequest());

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 2,
      actions: { launched: 0, terminated: 0, retainedUnknown: 2 },
      errors: [],
    });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);
  });

  it('recovery removes only exact idle runners and retains busy or unknown runners', async () => {
    const idle = ownedInstance('i-idle', { runnerId: 100, runnerName: 'runner-i-idle' });
    const busy = ownedInstance('i-busy', { runnerId: 101, runnerName: 'runner-i-busy' });
    const unknown = ownedInstance('i-unknown', { runnerId: 102, runnerName: 'runner-i-unknown' });
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [{ Instances: [idle, busy, unknown] }] });
    ec2Mock.on(TerminateInstancesCommand).resolves({});

    const removeRunner = vi.fn().mockResolvedValue({ status: 'removed' as const });
    const result = await createTestProvider().reconcile(
      createRequest({
        recoveryOnly: true,
        runnerInventoryComplete: true,
        removeRunner,
        runnerStates: [
          githubState(100, 'runner-i-idle', { status: 'offline', busy: false }),
          githubState(101, 'runner-i-busy', { status: 'online', busy: true }),
        ],
      }),
    );

    expect(result).toMatchObject({
      status: 'retained',
      currentRunners: 2,
      actions: { launched: 0, terminated: 1, retainedBusy: 1, retainedUnknown: 1 },
      errors: [],
    });
    expect(removeRunner).toHaveBeenCalledTimes(1);
    expect(ec2Mock).toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-idle'] });
    expect(ec2Mock).not.toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: ['i-busy', 'i-unknown'] });
    expect(ec2Mock).not.toHaveReceivedCommand(CreateFleetCommand);
  });

  it('propagates cancellation instead of converting shutdown into a retry result', async () => {
    const abort = new AbortController();
    abort.abort(new Error('service stopping'));

    await expect(createTestProvider().reconcile(createRequest({ signal: abort.signal }))).rejects.toThrow(
      'service stopping',
    );
    expect(ec2Mock).not.toHaveReceivedCommand(DescribeInstancesCommand);
  });
});

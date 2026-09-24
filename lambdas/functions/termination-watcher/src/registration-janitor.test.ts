import { EC2Client, DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Context, SQSEvent } from 'aws-lambda';

import { registrationJanitor, type RegistrationJanitorConfig } from './registration-janitor';
import { createRunnerInstallationClient } from './github-app-client';

const janitorLogs = vi.hoisted(() => ({ info: vi.fn(), setContext: vi.fn() }));
vi.mock('@aws-github-runner/aws-powertools-util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-github-runner/aws-powertools-util')>();
  return {
    ...actual,
    setContext: janitorLogs.setContext,
    createChildLogger: (name: string) => {
      const child = actual.createChildLogger(name);
      if (name === 'registration-janitor') vi.spyOn(child, 'info').mockImplementation(janitorLogs.info);
      return child;
    },
  };
});

const github = vi.hoisted(() => ({
  request: vi.fn(),
  actions: { getSelfHostedRunnerForOrg: vi.fn(), deleteSelfHostedRunnerFromOrg: vi.fn() },
}));
vi.mock('./github-app-client', () => ({ createRunnerInstallationClient: vi.fn().mockResolvedValue(github) }));
const customProvider = vi.hoisted(() => ({
  scope: 'test-scope',
  resourceIdFromRunnerName: vi.fn(),
  exists: vi.fn(),
}));
vi.mock('@aws-github-runner/compute-providers/registration-cleanup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-github-runner/compute-providers/registration-cleanup')>();
  return {
    ...actual,
    createRegistrationCleanupProvider: (config: { type: string; options: unknown }, prefix: string) =>
      config.type === 'test-provider' ? customProvider : actual.createRegistrationCleanupProvider(config, prefix),
  };
});
const ec2 = mockClient(EC2Client);
const sqs = mockClient(SQSClient);
const context = { getRemainingTimeInMillis: () => 60000 } as Context;
const instanceId = 'i-0123456789abcdef0';
const runner = { id: 10, name: `account-prod_${instanceId}`, status: 'offline', busy: false };
let config: RegistrationJanitorConfig;

function configure(overrides: Partial<RegistrationJanitorConfig> = {}) {
  config = { ...config, ...overrides };
  process.env.REGISTRATION_JANITOR_CONFIG = JSON.stringify(config);
}

async function confirmationEvent(): Promise<SQSEvent> {
  await registrationJanitor({}, context);
  const body = sqs.commandCalls(SendMessageCommand)[0].args[0].input.MessageBody!;
  vi.setSystemTime(Date.now() + 900000);
  return { Records: [{ body, messageId: 'candidate-1' }] } as SQSEvent;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-23T00:00:00Z'));
  vi.clearAllMocks();
  ec2.reset();
  sqs.reset();
  ec2.on(DescribeInstancesCommand).resolves({ Reservations: [] });
  sqs.on(SendMessageCommand).resolves({});
  github.request.mockImplementation(async () => ({ data: { runners: [runner] } }));
  github.actions.getSelfHostedRunnerForOrg.mockResolvedValue({ data: runner });
  github.actions.deleteSelfHostedRunnerFromOrg.mockResolvedValue({ status: 204 });
  config = {
    organization: 'example',
    runnerGroupIds: [1],
    runnerNamePrefix: 'account-prod_',
    computeProvider: { type: 'ec2', options: { regions: ['eu-west-1', 'us-east-1'] } },
    dryRun: false,
    maxCandidates: 100,
    ghesApiUrl: '',
  };
  configure();
  process.env.REGISTRATION_JANITOR_QUEUE_URL = 'https://sqs.eu-west-1.amazonaws.com/123456789012/confirmation';
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('registration janitor discovery', () => {
  it('discovers remaining inventory after earlier candidates have been removed', async () => {
    configure({ maxCandidates: 1 });
    const second = { ...runner, id: 20, name: 'account-prod_i-11111111111111111' };
    github.request.mockResolvedValue({ data: { runners: [runner, second] } });
    const event = await confirmationEvent();
    await registrationJanitor(event, context);
    expect(github.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({ org: 'example', runner_id: 10 });
    github.request.mockClear();
    github.request.mockResolvedValue({ data: { runners: [second] } });
    sqs.resetHistory();
    await registrationJanitor({}, context);
    expect(github.request).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ page: 1 }));
    expect(JSON.parse(sqs.commandCalls(SendMessageCommand)[0].args[0].input.MessageBody!).runnerId).toBe(20);
  });

  it('continues with another candidate when one EC2 lookup fails', async () => {
    github.request.mockResolvedValue({
      data: { runners: [runner, { ...runner, id: 20, name: 'account-prod_i-11111111111111111' }] },
    });
    ec2.on(DescribeInstancesCommand).rejectsOnce(new Error('EC2 unavailable')).resolves({ Reservations: [] });
    await registrationJanitor({}, context);
    expect(sqs).toHaveReceivedCommandTimes(SendMessageCommand, 1);
    expect(JSON.parse(sqs.commandCalls(SendMessageCommand)[0].args[0].input.MessageBody!).runnerId).toBe(20);
  });

  it('queues early-page candidates before a later GitHub page fails', async () => {
    const page = [
      runner,
      ...Array.from({ length: 99 }, (_, index) => ({ ...runner, id: index + 100, status: 'online' })),
    ];
    github.request
      .mockResolvedValueOnce({ data: { runners: page } })
      .mockImplementationOnce(() => {
        expect(sqs).toHaveReceivedCommandTimes(SendMessageCommand, 1);
        throw new Error('later page unavailable');
      })
      .mockResolvedValue({ data: { runners: [] } });
    await registrationJanitor({}, context);
    expect(sqs).toHaveReceivedCommandTimes(SendMessageCommand, 1);
    expect(github.request).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ page: 3 }));
  });

  it('queues a delayed check only for scoped offline, non-busy EC2 runners', async () => {
    github.request.mockImplementation(async () => ({
      data: {
        runners: [
          runner,
          { ...runner, id: 11, status: 'online' },
          { ...runner, id: 12, busy: true },
          { ...runner, id: 13, name: `other_${instanceId}` },
          { ...runner, id: 14, name: 'account-prod_i-123' },
          { ...runner, id: 15, name: `account-prod_nested_${instanceId}` },
        ],
      },
    }));
    await registrationJanitor({}, context);
    expect(sqs).toHaveReceivedCommandTimes(SendMessageCommand, 1);
    expect(sqs).toHaveReceivedCommandWith(SendMessageCommand, { DelaySeconds: 900 });
    expect(ec2).toHaveReceivedCommandTimes(DescribeInstancesCommand, 2);
    expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it.each(['pending', 'running', 'stopped', 'stopping', 'shutting-down', undefined])(
    'preserves %s instances in another configured region',
    async (state) => {
      ec2
        .on(DescribeInstancesCommand)
        .resolvesOnce({ Reservations: [] })
        .resolves({
          Reservations: [
            { Instances: [{ InstanceId: instanceId, State: state ? { Name: state as 'running' } : undefined }] },
          ],
        });
      await registrationJanitor({}, context);
      expect(sqs).not.toHaveReceivedCommand(SendMessageCommand);
    },
  );

  it('protects instances on later EC2 pages', async () => {
    ec2
      .on(DescribeInstancesCommand)
      .resolvesOnce({ NextToken: 'next' })
      .resolves({
        Reservations: [{ Instances: [{ InstanceId: instanceId, State: { Name: 'running' } }] }],
      });
    await registrationJanitor({}, context);
    expect(sqs).not.toHaveReceivedCommand(SendMessageCommand);
    expect(ec2).toHaveReceivedCommandWith(DescribeInstancesCommand, { NextToken: 'next' });
  });

  it('allows terminated instances to become confirmation candidates', async () => {
    ec2.on(DescribeInstancesCommand).resolves({
      Reservations: [{ Instances: [{ InstanceId: instanceId, State: { Name: 'terminated' } }] }],
    });
    await registrationJanitor({}, context);
    expect(sqs).toHaveReceivedCommandTimes(SendMessageCommand, 1);
  });

  it('enqueues nothing if any region cannot be checked', async () => {
    ec2.on(DescribeInstancesCommand).resolvesOnce({ Reservations: [] }).rejects(new Error('Access denied'));
    await registrationJanitor({}, context);
    expect(sqs).not.toHaveReceivedCommand(SendMessageCommand);
  });

  it('enqueues nothing if group listing fails', async () => {
    github.request.mockRejectedValue(new Error('GitHub unavailable'));
    await registrationJanitor({}, context);
    expect(sqs).not.toHaveReceivedCommand(SendMessageCommand);
  });

  it('does not mutate in dry-run mode', async () => {
    configure({ dryRun: true });
    await registrationJanitor({}, context);
    expect(sqs).not.toHaveReceivedCommand(SendMessageCommand);
    expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it('shares the candidate budget across groups', async () => {
    configure({ runnerGroupIds: [1, 2], maxCandidates: 1 });
    github.request.mockImplementation(async () => ({
      data: { runners: [runner, { ...runner, id: 20, name: 'account-prod_i-11111111111111111' }] },
    }));
    await registrationJanitor({}, context);
    expect(sqs).toHaveReceivedCommandTimes(SendMessageCommand, 1);
  });

  it('does not spend the candidate limit on retained instances or failed lookups', async () => {
    configure({ maxCandidates: 1 });
    github.request.mockResolvedValue({
      data: {
        runners: [
          runner,
          { ...runner, id: 20, name: 'account-prod_i-11111111111111111' },
          { ...runner, id: 30, name: 'account-prod_i-22222222222222222' },
        ],
      },
    });
    ec2
      .on(DescribeInstancesCommand)
      .resolvesOnce({ Reservations: [{ Instances: [{ InstanceId: instanceId, State: { Name: 'running' } }] }] })
      .resolvesOnce({ Reservations: [] })
      .rejectsOnce(new Error('unavailable'))
      .resolves({ Reservations: [] });
    await registrationJanitor({}, context);
    expect(sqs).toHaveReceivedCommandTimes(SendMessageCommand, 1);
    expect(JSON.parse(sqs.commandCalls(SendMessageCommand)[0].args[0].input.MessageBody!).runnerId).toBe(30);
  });

  it('requires the confirmation queue before sending candidates', async () => {
    delete process.env.REGISTRATION_JANITOR_QUEUE_URL;
    await registrationJanitor({}, context);
    expect(sqs).not.toHaveReceivedCommand(SendMessageCommand);
  });

  it('handles empty EC2 pages and reservations', async () => {
    ec2
      .on(DescribeInstancesCommand)
      .resolvesOnce({})
      .resolves({ Reservations: [{}] });
    await registrationJanitor({}, context);
    expect(sqs).toHaveReceivedCommandTimes(SendMessageCommand, 1);
  });

  it('rejects absent configuration', async () => {
    delete process.env.REGISTRATION_JANITOR_CONFIG;
    await expect(registrationJanitor({}, context)).rejects.toThrow('Invalid REGISTRATION_JANITOR_CONFIG');
  });

  it('stops queueing before the Lambda deadline', async () => {
    await registrationJanitor({}, { getRemainingTimeInMillis: () => 1000 } as Context);
    expect(sqs).not.toHaveReceivedCommand(SendMessageCommand);
  });

  it.each([{ runnerNamePrefix: '' }, { runnerGroupIds: [] }, { dryRun: undefined }, { maxCandidates: 0 }])(
    'rejects unsafe config %s',
    async (invalid) => {
      configure(invalid);
      await expect(registrationJanitor({}, context)).rejects.toThrow('Invalid REGISTRATION_JANITOR_CONFIG');
    },
  );
});

describe('registration janitor confirmation', () => {
  it('continues a confirmation batch after one record fails and lists each group once', async () => {
    const event = await confirmationEvent();
    event.Records.unshift({ body: 'invalid JSON', messageId: 'invalid' } as SQSEvent['Records'][number]);
    github.request.mockClear();
    expect(await registrationJanitor(event, context)).toEqual({ batchItemFailures: [{ itemIdentifier: 'invalid' }] });
    expect(github.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({ org: 'example', runner_id: 10 });
    expect(github.request).toHaveBeenCalledTimes(1);
  });

  it('checks membership page by page without storing a continuation', async () => {
    const event = await confirmationEvent();
    sqs.resetHistory();
    github.request
      .mockResolvedValueOnce({
        data: { runners: Array.from({ length: 100 }, (_, index) => ({ ...runner, id: 100 + index })) },
      })
      .mockResolvedValue({ data: { runners: [runner] } });
    await registrationJanitor(event, context);
    expect(github.request).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ page: 2 }));
    expect(github.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({ org: 'example', runner_id: 10 });
    expect(sqs).not.toHaveReceivedCommand(SendMessageCommand);
  });

  it('preserves a candidate when the membership check reaches the deadline', async () => {
    const event = await confirmationEvent();
    expect(await registrationJanitor(event, { getRemainingTimeInMillis: () => 1000 } as Context)).toEqual({
      batchItemFailures: [{ itemIdentifier: 'candidate-1' }],
    });
    expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it('deletes only after delayed EC2 and GitHub rechecks', async () => {
    const event = await confirmationEvent();
    ec2.resetHistory();
    expect(await registrationJanitor(event, context)).toEqual({ batchItemFailures: [] });
    expect(ec2).toHaveReceivedCommandTimes(DescribeInstancesCommand, 2);
    expect(github.actions.getSelfHostedRunnerForOrg).toHaveBeenCalledWith({ org: 'example', runner_id: 10 });
    expect(github.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({ org: 'example', runner_id: 10 });
  });

  it.each([{ status: 'online' }, { busy: true }, { name: 'renamed' }])(
    'preserves registrations whose state changed: %s',
    async (change) => {
      const event = await confirmationEvent();
      github.actions.getSelfHostedRunnerForOrg.mockResolvedValue({ data: { ...runner, ...change } });
      await registrationJanitor(event, context);
      expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
    },
  );

  it('preserves instances that appear after discovery', async () => {
    const event = await confirmationEvent();
    ec2
      .on(DescribeInstancesCommand)
      .resolves({ Reservations: [{ Instances: [{ InstanceId: instanceId, State: { Name: 'stopped' } }] }] });
    await registrationJanitor(event, context);
    expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it('preserves runners moved out of the configured groups', async () => {
    const event = await confirmationEvent();
    github.request.mockImplementation(async () => ({ data: { runners: [] } }));
    await registrationJanitor(event, context);
    expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it('discards messages after scope configuration changes', async () => {
    const event = await confirmationEvent();
    configure({ computeProvider: { type: 'ec2', options: { regions: ['eu-west-1'] } } });
    await registrationJanitor(event, context);
    expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it('discards messages older than one day', async () => {
    const event = await confirmationEvent();
    vi.setSystemTime(Date.now() + 86400000);
    await registrationJanitor(event, context);
    expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it('does not delete if dry-run is enabled while messages are pending', async () => {
    const event = await confirmationEvent();
    configure({ dryRun: true });
    await registrationJanitor(event, context);
    expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it('retries confirmation delivered before the observation delay', async () => {
    const event = await confirmationEvent();
    vi.setSystemTime(Date.now() - 1000);
    expect(await registrationJanitor(event, context)).toEqual({
      batchItemFailures: [{ itemIdentifier: 'candidate-1' }],
    });
    expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });

  it.each(['ec2', 'github', 'delete'])(
    'retries %s errors without treating unavailable state as absence',
    async (failure) => {
      const event = await confirmationEvent();
      if (failure === 'ec2') ec2.on(DescribeInstancesCommand).rejects(new Error('EC2 unavailable'));
      if (failure === 'github')
        github.actions.getSelfHostedRunnerForOrg.mockRejectedValue(new Error('GitHub unavailable'));
      if (failure === 'delete')
        github.actions.deleteSelfHostedRunnerFromOrg.mockRejectedValue(new Error('GitHub unavailable'));
      expect(await registrationJanitor(event, context)).toEqual({
        batchItemFailures: [{ itemIdentifier: 'candidate-1' }],
      });
      if (failure !== 'delete') expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
    },
  );

  it.each(['get', 'delete'])('treats a %s 404 as already removed', async (operation) => {
    const event = await confirmationEvent();
    const method =
      operation === 'get' ? github.actions.getSelfHostedRunnerForOrg : github.actions.deleteSelfHostedRunnerFromOrg;
    method.mockRejectedValue({ status: 404 });
    expect(await registrationJanitor(event, context)).toEqual({ batchItemFailures: [] });
  });
});

describe('provider-independent registration cleanup', () => {
  it('discovers and confirms a non-EC2 resource without AWS inventory calls', async () => {
    configure({ computeProvider: { type: 'test-provider', options: {} } });
    const customRunner = { ...runner, name: 'account-prod_container-42' };
    github.request.mockResolvedValue({ data: { runners: [customRunner] } });
    github.actions.getSelfHostedRunnerForOrg.mockResolvedValue({ data: customRunner });
    customProvider.resourceIdFromRunnerName.mockReturnValue('container-42');
    customProvider.exists.mockResolvedValue(false);
    const event = await confirmationEvent();
    expect(JSON.parse(event.Records[0].body).resourceId).toBe('container-42');
    await registrationJanitor(event, context);
    expect(customProvider.exists).toHaveBeenNthCalledWith(1, 'container-42');
    expect(customProvider.exists).toHaveBeenNthCalledWith(2, 'container-42');
    expect(ec2).not.toHaveReceivedCommand(DescribeInstancesCommand);
    expect(github.actions.deleteSelfHostedRunnerFromOrg).toHaveBeenCalledWith({ org: 'example', runner_id: 10 });
  });

  it('retains a candidate when the provider cannot establish absence at confirmation', async () => {
    configure({ computeProvider: { type: 'test-provider', options: {} } });
    customProvider.resourceIdFromRunnerName.mockReturnValue('resource-42');
    customProvider.exists.mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('inventory unavailable'));
    const event = await confirmationEvent();
    expect(await registrationJanitor(event, context)).toEqual({
      batchItemFailures: [{ itemIdentifier: 'candidate-1' }],
    });
    expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
  });
});

describe('confirmation deadline guards', () => {
  it.each([
    { stage: 'authentication', checks: 0, membership: 0, inventory: 0, recheck: 0 },
    { stage: 'inventory after membership', checks: 2, membership: 1, inventory: 0, recheck: 0 },
    { stage: 'GitHub recheck after inventory', checks: 3, membership: 1, inventory: 2, recheck: 0 },
    { stage: 'deletion after GitHub recheck', checks: 4, membership: 1, inventory: 2, recheck: 1 },
  ])(
    'defers work before $stage and leaves later records retryable',
    async ({ checks, membership, inventory, recheck }) => {
      const event = await confirmationEvent();
      event.Records.push({ ...event.Records[0], messageId: 'candidate-2' });
      ec2.resetHistory();
      github.request.mockClear();
      github.actions.getSelfHostedRunnerForOrg.mockClear();
      const remaining = vi.fn().mockReturnValue(9000);
      for (let i = 0; i < checks; i++) remaining.mockReturnValueOnce(60000);
      expect(await registrationJanitor(event, { getRemainingTimeInMillis: remaining } as unknown as Context)).toEqual({
        batchItemFailures: [{ itemIdentifier: 'candidate-1' }, { itemIdentifier: 'candidate-2' }],
      });
      expect(github.request).toHaveBeenCalledTimes(membership);
      expect(ec2.commandCalls(DescribeInstancesCommand)).toHaveLength(inventory);
      expect(github.actions.getSelfHostedRunnerForOrg).toHaveBeenCalledTimes(recheck);
      expect(github.actions.deleteSelfHostedRunnerFromOrg).not.toHaveBeenCalled();
    },
  );
});

describe('invocation reuse and discovery observability', () => {
  it('shares one client cache across discovery pages and resets it next invocation', async () => {
    github.request
      .mockResolvedValueOnce({
        data: { runners: Array.from({ length: 100 }, () => ({ ...runner, status: 'online' })) },
      })
      .mockResolvedValue({ data: { runners: [] } });
    await registrationJanitor({}, context);
    const calls = vi.mocked(createRunnerInstallationClient).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][3]).toBe(calls[1][3]);
    await registrationJanitor({}, context);
    expect(calls[2][3]).not.toBe(calls[0][3]);
  });

  it('shares one client cache within a confirmation batch and sets fresh invocation context', async () => {
    const event = await confirmationEvent();
    event.Records.push({ ...event.Records[0], messageId: 'second' });
    vi.mocked(createRunnerInstallationClient).mockClear();
    const batchContext = { ...context, awsRequestId: 'confirmation-request', functionName: 'janitor' } as Context;
    await registrationJanitor(event, batchContext);
    const calls = vi.mocked(createRunnerInstallationClient).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][3]).toBe(calls[1][3]);
    expect(janitorLogs.setContext).toHaveBeenLastCalledWith(batchContext, 'registration-janitor');
  });

  it('reports queued candidates and resources retained in live discovery', async () => {
    github.request.mockResolvedValue({ data: { runners: [runner, { ...runner, id: 11 }] } });
    ec2
      .on(DescribeInstancesCommand)
      .resolvesOnce({ Reservations: [] })
      .resolvesOnce({ Reservations: [] })
      .resolves({ Reservations: [{ Instances: [{ InstanceId: instanceId, State: { Name: 'stopped' } }] }] });
    await registrationJanitor({}, context);
    expect(janitorLogs.info).toHaveBeenCalledWith(
      'Registration discovery finished.',
      expect.objectContaining({
        pagesScanned: 1,
        candidatesQueued: 1,
        existingResources: 1,
        dryRunCandidates: 0,
        stopReason: 'completed',
      }),
    );
  });

  it('reports dry-run candidates separately from queued work', async () => {
    configure({ dryRun: true });
    await registrationJanitor({}, context);
    expect(janitorLogs.info).toHaveBeenCalledWith(
      'Registration discovery finished.',
      expect.objectContaining({ candidatesQueued: 0, dryRunCandidates: 1, dryRun: true }),
    );
  });

  it('reports failures without claiming failed queue sends succeeded', async () => {
    sqs.on(SendMessageCommand).rejects(new Error('queue unavailable'));
    await registrationJanitor({}, context);
    expect(janitorLogs.info).toHaveBeenCalledWith(
      'Registration discovery finished.',
      expect.objectContaining({ candidatesQueued: 0, candidateFailures: 1 }),
    );
  });

  it('reports partial discovery when the deadline stops scanning', async () => {
    await registrationJanitor({}, { ...context, getRemainingTimeInMillis: () => 1000 });
    expect(janitorLogs.info).toHaveBeenCalledWith(
      'Registration discovery finished.',
      expect.objectContaining({ pagesScanned: 0, candidatesQueued: 0, stopReason: 'deadline' }),
    );
  });
});

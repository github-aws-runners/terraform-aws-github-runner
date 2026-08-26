import { CreateFleetCommand, DescribeInstancesCommand, TerminateInstancesCommand } from '@aws-sdk/client-ec2';
import { DeleteParameterCommand, GetParameterCommand, PutParameterCommand } from '@aws-sdk/client-ssm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EC2_GITHUB_SCOPE_HASH_TAG,
  EC2_RUNNER_CONFIG_TAG,
  EC2_SCALE_SET_ID_TAG,
  EC2_SCALE_SET_STATE_TAG,
} from './inventory';
import { config, createRequest, githubScopeHash, jitResult, signal } from './test/fixtures';
import { createTestProvider, ec2Mock, resetAwsMocks, ssmMock } from './test/provider-harness';

beforeEach(resetAwsMocks);

describe('EC2 scale-set scale up', () => {
  it('launches owned compute, verifies JIT identity, and publishes only a SecureString', async () => {
    const instanceId = 'i-1234567890abcdef0';
    ec2Mock.on(DescribeInstancesCommand).resolves({});
    ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [instanceId] }] });
    const generateJitConfiguration = vi.fn().mockResolvedValue(jitResult(instanceId));

    const result = await createTestProvider().reconcile(createRequest({ generateJitConfiguration }));

    expect(result).toEqual({
      status: 'converged',
      desiredRunners: 1,
      currentRunners: 1,
      needsRunnerInventory: false,
      actions: { launched: 1, terminated: 0, retainedBusy: 0, retainedUnknown: 0 },
      errors: [],
    });
    expect(generateJitConfiguration).toHaveBeenCalledWith({ runnerName: `runner-${instanceId}`, signal });
    expect(ec2Mock).toHaveReceivedCommandWith(CreateFleetCommand, {
      TagSpecifications: expect.arrayContaining([
        expect.objectContaining({
          ResourceType: 'instance',
          Tags: expect.arrayContaining([
            { Key: 'ghr:created_by', Value: 'scale-set-service' },
            { Key: 'ghr:environment', Value: 'unit-test' },
            { Key: 'ghr:Owner', Value: 'example' },
            { Key: 'ghr:Type', Value: 'Org' },
            { Key: EC2_RUNNER_CONFIG_TAG, Value: 'linux' },
            { Key: EC2_SCALE_SET_ID_TAG, Value: '42' },
            { Key: EC2_GITHUB_SCOPE_HASH_TAG, Value: githubScopeHash },
            { Key: EC2_SCALE_SET_STATE_TAG, Value: 'provisioning' },
          ]),
        }),
      ]),
    });
    expect(ssmMock).toHaveReceivedCommandWith(PutParameterCommand, {
      Name: `${config.jitConfigParameterPath}/${instanceId}`,
      Value: 'sensitive-encoded-jit-configuration',
      Type: 'SecureString',
      Overwrite: false,
      Tags: expect.arrayContaining([
        { Key: 'InstanceId', Value: instanceId },
        { Key: EC2_RUNNER_CONFIG_TAG, Value: 'linux' },
        { Key: EC2_SCALE_SET_ID_TAG, Value: '42' },
        { Key: EC2_GITHUB_SCOPE_HASH_TAG, Value: githubScopeHash },
      ]),
    });
  });

  it('resolves an AMI parameter through the provider-owned SSM client', async () => {
    const instanceId = 'i-1234567890abcdef0';
    const amiIdSsmParameterName = '/github-action-runners/unit-test/ami';
    ec2Mock.on(DescribeInstancesCommand).resolves({});
    ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [instanceId] }] });
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'ami-0123456789abcdef0' } });

    const result = await createTestProvider({
      configuration: { ...config, amiIdSsmParameterName },
    }).reconcile(createRequest());

    expect(result.actions.launched).toBe(1);
    expect(ssmMock).toHaveReceivedCommandWith(GetParameterCommand, {
      Name: amiIdSsmParameterName,
      WithDecryption: true,
    });
  });

  it('does not remove an unrelated GitHub runner when JIT identity validation fails', async () => {
    const instanceId = 'i-1234567890abcdef0';
    ec2Mock.on(DescribeInstancesCommand).resolves({});
    ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [instanceId] }] });
    const removeRunner = vi.fn();

    const result = await createTestProvider().reconcile(
      createRequest({
        generateJitConfiguration: vi.fn().mockResolvedValue({
          ...jitResult(instanceId),
          runnerName: 'runner-owned-by-another-config',
        }),
        removeRunner,
      }),
    );

    expect(result).toMatchObject({
      status: 'non_retryable_error',
      currentRunners: 0,
      actions: { launched: 0, terminated: 1 },
      errors: [expect.objectContaining({ operation: 'generate_jit_configuration', retryable: false })],
    });
    expect(removeRunner).not.toHaveBeenCalled();
    expect(ssmMock).not.toHaveReceivedCommand(PutParameterCommand);
    expect(ec2Mock).toHaveReceivedCommandWith(TerminateInstancesCommand, { InstanceIds: [instanceId] });
  });

  it('retains compute when failed JIT publication cannot be safely cancelled', async () => {
    const instanceId = 'i-1234567890abcdef0';
    ec2Mock.on(DescribeInstancesCommand).resolves({});
    ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [instanceId] }] });
    ssmMock.on(PutParameterCommand).rejects(Object.assign(new Error('redacted secret'), { name: 'TimeoutError' }));
    ssmMock.on(DeleteParameterCommand).rejects(Object.assign(new Error('missing'), { name: 'ParameterNotFound' }));
    const removeRunner = vi.fn();

    const result = await createTestProvider().reconcile(createRequest({ removeRunner }));

    expect(result).toMatchObject({
      status: 'retryable_error',
      currentRunners: 1,
      actions: { launched: 0, terminated: 0, retainedUnknown: 1 },
      errors: [expect.objectContaining({ operation: 'publish_jit_configuration', code: 'TimeoutError' })],
    });
    expect(JSON.stringify(result)).not.toContain('redacted secret');
    expect(removeRunner).not.toHaveBeenCalled();
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });

  it('does not treat a successful DeleteParameter as proof that bootstrap did not read JIT first', async () => {
    const instanceId = 'i-1234567890abcdef0';
    ec2Mock.on(DescribeInstancesCommand).resolves({});
    ec2Mock.on(CreateFleetCommand).resolves({ Instances: [{ InstanceIds: [instanceId] }] });
    ssmMock.on(PutParameterCommand).rejects(Object.assign(new Error('throttled'), { name: 'ThrottlingException' }));
    ssmMock.on(DeleteParameterCommand).resolves({});
    const removeRunner = vi.fn().mockResolvedValue({ status: 'removed' });

    const result = await createTestProvider().reconcile(createRequest({ removeRunner }));

    expect(result).toMatchObject({
      status: 'retryable_error',
      currentRunners: 1,
      actions: { launched: 0, terminated: 0, retainedUnknown: 1 },
    });
    expect(ssmMock).toHaveReceivedCommandWith(DeleteParameterCommand, {
      Name: `${config.jitConfigParameterPath}/${instanceId}`,
    });
    expect(removeRunner).not.toHaveBeenCalled();
    expect(ec2Mock).not.toHaveReceivedCommand(TerminateInstancesCommand);
  });
});

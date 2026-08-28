import { createHash } from 'node:crypto';

import type { Instance } from '@aws-sdk/client-ec2';
import { vi } from 'vitest';

import type {
  GenerateScaleSetJitConfigurationResult,
  ScaleSetReconcileRequest,
  ScaleSetRunnerState,
} from '../../../../../scale-set';
import type { Ec2ScaleSetProviderConfig } from '../configuration';
import {
  EC2_GITHUB_SCOPE_HASH_TAG,
  EC2_GITHUB_RUNNER_ID_TAG,
  EC2_RUNNER_CONFIG_TAG,
  EC2_RUNNER_NAME_TAG,
  EC2_SCALE_SET_ID_TAG,
  EC2_SCALE_SET_STATE_TAG,
} from '../inventory';

export const signal = new AbortController().signal;
export const githubScope = 'https://github.com/example';
export const githubScopeHash = createHash('sha256').update(githubScope, 'utf8').digest('hex');

export const config: Ec2ScaleSetProviderConfig = {
  region: 'eu-west-1',
  environment: 'unit-test',
  runnerNamePrefix: 'runner-',
  jitConfigParameterPath: '/github-action-runners/unit-test/runners/tokens',
  subnets: ['subnet-12345678'],
  launchTemplateName: 'unit-test-runners',
  ec2instanceCriteria: {
    instanceTypes: ['m7i.large'],
    targetCapacityType: 'on-demand',
    instanceAllocationStrategy: 'lowest-price',
  },
  ssmParameterTags: [{ Key: 'Project', Value: 'runner-tests' }],
};

export function ownedInstance(
  instanceId: string,
  identity?: { runnerId: number; runnerName: string },
  overrides: {
    runnerConfigName?: string;
    scaleSetId?: number;
    scaleSetState?: string;
    githubScopeHash?: string;
    launchTime?: Date;
  } = {},
): Instance {
  return {
    InstanceId: instanceId,
    LaunchTime: overrides.launchTime ?? new Date('2026-08-24T10:00:00Z'),
    Tags: [
      { Key: 'ghr:Application', Value: 'github-action-runner' },
      { Key: 'ghr:created_by', Value: 'scale-set-service' },
      { Key: 'ghr:environment', Value: 'unit-test' },
      { Key: EC2_RUNNER_CONFIG_TAG, Value: overrides.runnerConfigName ?? 'linux' },
      { Key: EC2_SCALE_SET_ID_TAG, Value: String(overrides.scaleSetId ?? 42) },
      { Key: EC2_GITHUB_SCOPE_HASH_TAG, Value: overrides.githubScopeHash ?? githubScopeHash },
      {
        Key: EC2_SCALE_SET_STATE_TAG,
        Value: overrides.scaleSetState ?? (identity ? 'config-published' : 'provisioning'),
      },
      ...(identity
        ? [
            { Key: EC2_RUNNER_NAME_TAG, Value: identity.runnerName },
            { Key: EC2_GITHUB_RUNNER_ID_TAG, Value: String(identity.runnerId) },
          ]
        : []),
    ],
  };
}

export function githubState(
  runnerId: number,
  runnerName: string,
  overrides: Partial<ScaleSetRunnerState> = {},
): ScaleSetRunnerState {
  return {
    runnerId,
    runnerName,
    scaleSetId: 42,
    status: 'online',
    busy: false,
    lifecycle: 'unknown',
    ...overrides,
  };
}

export function jitResult(instanceId = 'i-1234567890abcdef0'): GenerateScaleSetJitConfigurationResult {
  return {
    encodedJitConfiguration: 'sensitive-encoded-jit-configuration',
    runnerId: 101,
    runnerName: `runner-${instanceId}`,
    scaleSetId: 42,
  };
}

export function createRequest(overrides: Partial<ScaleSetReconcileRequest> = {}): ScaleSetReconcileRequest {
  return {
    desiredRunners: 1,
    busyRunners: 0,
    bootTimeoutMinutes: 10,
    runnerStates: [],
    signal,
    generateJitConfiguration: vi.fn().mockResolvedValue(jitResult()),
    removeRunner: vi.fn().mockResolvedValue({ status: 'removed' }),
    ...overrides,
  };
}

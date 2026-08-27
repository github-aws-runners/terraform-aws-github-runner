import { DescribeInstancesCommand } from '@aws-sdk/client-ec2';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRequest } from './test/fixtures';
import { createTestProvider, ec2Mock, resetAwsMocks } from './test/provider-harness';

beforeEach(resetAwsMocks);

describe('EC2 scale-set reconciliation validation', () => {
  it('rejects an invalid desired count without touching AWS', async () => {
    const result = await createTestProvider().reconcile(createRequest({ desiredRunners: -1 }));

    expect(result).toMatchObject({
      status: 'error',
      desiredRunners: -1,
      currentRunners: 0,
    });
    expect(result.errors).toEqual([{ operation: 'validate', code: 'INVALID_DESIRED_RUNNER_COUNT' }]);
    expect(ec2Mock).not.toHaveReceivedCommand(DescribeInstancesCommand);
  });

  it.each([0, 121, 1.5])('rejects invalid orchestration boot timeout %s without touching AWS', async (value) => {
    const result = await createTestProvider().reconcile(createRequest({ bootTimeoutMinutes: value }));

    expect(result).toMatchObject({
      status: 'error',
      currentRunners: 0,
    });
    expect(result.errors).toEqual([{ operation: 'validate', code: 'INVALID_BOOT_TIMEOUT' }]);
    expect(ec2Mock).not.toHaveReceivedCommand(DescribeInstancesCommand);
  });
});

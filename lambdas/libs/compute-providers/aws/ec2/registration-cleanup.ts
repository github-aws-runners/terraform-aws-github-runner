import { EC2Client, paginateDescribeInstances } from '@aws-sdk/client-ec2';
import type { RegistrationCleanupProviderModule } from '../../registration-cleanup';

export const provider: RegistrationCleanupProviderModule = {
  type: 'ec2',
  create(config, runnerNamePrefix) {
    const regions = (config as { regions?: unknown } | null)?.regions;
    if (
      !Array.isArray(regions) ||
      regions.length === 0 ||
      !regions.every((region): region is string => typeof region === 'string' && region.trim().length > 0)
    ) {
      throw new Error('Invalid EC2 registration cleanup regions');
    }
    const sortedRegions = [...new Set(regions)].sort();
    return {
      scope: JSON.stringify(sortedRegions),
      resourceIdFromRunnerName(name) {
        if (!name.startsWith(runnerNamePrefix)) return undefined;
        const id = name.slice(runnerNamePrefix.length);
        return /^i-(?:[0-9a-f]{8}|[0-9a-f]{17})$/.test(id) ? id : undefined;
      },
      async exists(resourceId) {
        // No tag filters: stopped or retagged instances still protect registrations.
        for (const region of sortedRegions) {
          for await (const page of paginateDescribeInstances(
            { client: new EC2Client({ region }) },
            { Filters: [{ Name: 'instance-id', Values: [resourceId] }] },
          )) {
            for (const reservation of page.Reservations ?? []) {
              if (
                reservation.Instances?.some(
                  (instance) => instance.InstanceId === resourceId && instance.State?.Name !== 'terminated',
                )
              )
                return true;
            }
          }
        }
        // Absence requires a complete successful lookup in every configured region.
        return false;
      },
    };
  },
};

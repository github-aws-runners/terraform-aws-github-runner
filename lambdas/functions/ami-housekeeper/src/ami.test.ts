import {
  DeleteSnapshotCommand,
  DeregisterImageCommand,
  DescribeImagesCommand,
  DescribeLaunchTemplateVersionsCommand,
  DescribeLaunchTemplatesCommand,
  EC2Client,
  Image,
} from '@aws-sdk/client-ec2';
import {
  DescribeParametersCommand,
  DescribeParametersCommandOutput,
  GetParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest/vitest';

import { AmiCleanupOptions, amiCleanup, defaultAmiCleanupOptions } from './ami';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fail } from 'assert';

process.env.AWS_REGION = 'eu-east-1';
const deleteAmisOlderThenDays = 30;
const date31DaysAgo = new Date(new Date().setDate(new Date().getDate() - (deleteAmisOlderThenDays + 1)));

const mockEC2Client = mockClient(EC2Client);
const mockSSMClient = mockClient(SSMClient);

const imagesInUseSsm: Image[] = [
  {
    ImageId: 'ami-ssm0001',
    CreationDate: date31DaysAgo.toISOString(),
    BlockDeviceMappings: [
      {
        Ebs: {
          SnapshotId: 'snap-ssm0001',
        },
      },
    ],
  },
  {
    ImageId: 'ami-ssm0002',
  },
];

const imagesInUseLaunchTemplates: Image[] = [
  {
    ImageId: 'ami-lt0001',
    CreationDate: date31DaysAgo.toISOString(),
  },
];

const imagesInUse: Image[] = [...imagesInUseSsm, ...imagesInUseLaunchTemplates];

const ssmParameters: DescribeParametersCommandOutput = {
  Parameters: [
    {
      Name: 'ami-id/ami-ssm0001',
      Type: 'String',
      Version: 1,
    },
    {
      Name: 'ami-id/ami-ssm0002',
      Type: 'String',
      Version: 1,
    },
  ],
  $metadata: {
    httpStatusCode: 200,
    requestId: '1234',
    extendedRequestId: '1234',
    cfId: undefined,
    attempts: 1,
    totalRetryDelay: 0,
  },
};

describe("delete AMI's", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEC2Client.reset();
    mockSSMClient.reset();

    mockSSMClient.on(DescribeParametersCommand).resolves(ssmParameters);
    mockSSMClient.on(GetParameterCommand, { Name: 'ami-id/ami-ssm0001' }).resolves({
      Parameter: {
        Name: 'ami-id/ami-ssm0001',
        Type: 'String',
        Value: 'ami-ssm0001',
        Version: 1,
      },
    });
    mockSSMClient.on(GetParameterCommand, { Name: 'ami-id/ami-ssm0002' }).resolves({
      Parameter: {
        Name: 'ami-id/ami-ssm0002',
        Type: 'String',
        Value: 'ami-ssm0002',
        Version: 1,
      },
    });

    mockEC2Client.on(DescribeLaunchTemplatesCommand).resolves({
      LaunchTemplates: [
        {
          LaunchTemplateId: 'lt-1234',
          LaunchTemplateName: 'lt-1234',
          DefaultVersionNumber: 1,
          LatestVersionNumber: 2,
        },
      ],
    });

    mockEC2Client
      .on(DescribeLaunchTemplateVersionsCommand, {
        LaunchTemplateId: 'lt-1234',
      })
      .resolves({
        LaunchTemplateVersions: [
          {
            LaunchTemplateId: 'lt-1234',
            LaunchTemplateName: 'lt-1234',
            VersionNumber: 2,
            LaunchTemplateData: {
              ImageId: 'ami-lt0001',
            },
          },
        ],
      });
  });

  mockEC2Client.on(DeregisterImageCommand).resolves({});
  mockEC2Client.on(DeleteSnapshotCommand).resolves({});

  it('should look up images in SSM, nothing to delete.', async () => {
    mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
      Images: [],
    });

    await amiCleanup({ ssmParameterNames: ['*ami-id'] });
    expect(mockEC2Client).not.toHaveReceivedCommand(DeregisterImageCommand);
    expect(mockEC2Client).not.toHaveReceivedCommand(DeleteSnapshotCommand);
    expect(mockEC2Client).toHaveReceivedCommand(DescribeLaunchTemplatesCommand);
    expect(mockEC2Client).toHaveReceivedCommand(DescribeLaunchTemplateVersionsCommand);
    expect(mockSSMClient).toHaveReceivedCommand(DescribeParametersCommand);
    expect(mockSSMClient).toHaveReceivedCommandTimes(GetParameterCommand, 2);
    expect(mockSSMClient).toHaveReceivedCommandWith(GetParameterCommand, {
      Name: 'ami-id/ami-ssm0001',
    });
    expect(mockSSMClient).toHaveReceivedCommandWith(GetParameterCommand, {
      Name: 'ami-id/ami-ssm0002',
    });
  });

  it('should NOT delete instances in use.', async () => {
    mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
      Images: imagesInUse,
    });

    // rely on defaults, instances imagesInSssm will be deleted as well
    await amiCleanup({
      ssmParameterNames: ['*ami-id'],
      minimumDaysOld: 0,
    });
    expect(mockEC2Client).not.toHaveReceivedCommand(DeregisterImageCommand);
    expect(mockEC2Client).not.toHaveReceivedCommand(DeleteSnapshotCommand);
  });

  it('Should rely on defaults if no options are passed.', async () => {
    mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
      Images: [
        {
          ImageId: 'ami-notOld',
          CreationDate: new Date().toISOString(),
        },
        {
          ImageId: 'ami-old',
          CreationDate: date31DaysAgo.toISOString(),
        },
      ],
    });

    // force null values since json does not support undefined
    await amiCleanup({
      ssmParameterNames: null,
      minimumDaysOld: null,
      filters: null,
      launchTemplateNames: null,
      maxItems: null,
    } as unknown as AmiCleanupOptions);

    expect(mockSSMClient).not.toHaveReceivedCommand(DescribeParametersCommand);
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeLaunchTemplatesCommand, {
      LaunchTemplateNames: undefined,
    });
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeImagesCommand, {
      Filters: defaultAmiCleanupOptions.amiFilters,
      MaxResults: defaultAmiCleanupOptions.maxItems,
      Owners: ['self'],
    });
    expect(mockEC2Client).toHaveReceivedCommandWith(DeregisterImageCommand, {
      ImageId: 'ami-old',
    });
  });

  it('should NOT delete instances in use, SSM not used.', async () => {
    mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
      Images: imagesInUse,
    });

    // rely on defaults, instances imagesInSssm will be deleted as well
    await amiCleanup({
      minimumDaysOld: 0,
    });

    // one images in imagesInUseSsm is not deleted since it has no creation date.
    expect(mockEC2Client).toHaveReceivedCommandTimes(DeregisterImageCommand, 1);
    expect(mockEC2Client).toHaveReceivedCommandTimes(DeleteSnapshotCommand, 1);
    expect(mockEC2Client).toHaveReceivedCommandWith(DeregisterImageCommand, {
      ImageId: 'ami-ssm0001',
    });
    expect(mockEC2Client).toHaveReceivedCommandWith(DeleteSnapshotCommand, {
      SnapshotId: 'snap-ssm0001',
    });
  });

  it('should not call delete when no AMIs at all.', async () => {
    mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
      Images: undefined,
    });
    mockSSMClient.on(DescribeParametersCommand).resolves({
      Parameters: undefined,
    });
    mockEC2Client.on(DescribeLaunchTemplatesCommand).resolves({
      LaunchTemplates: undefined,
    });

    await amiCleanup({ ssmParameterNames: ['*ami-id'] });
    expect(mockEC2Client).not.toHaveReceivedCommand(DeregisterImageCommand);
    expect(mockEC2Client).not.toHaveReceivedCommand(DeleteSnapshotCommand);
  });

  it('should filter delete AMIs not in use older then 30 days.', async () => {
    mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
      Images: [
        ...imagesInUse,
        {
          ImageId: 'ami-old0001',
          CreationDate: date31DaysAgo.toISOString(),
          BlockDeviceMappings: [
            {
              Ebs: {
                SnapshotId: 'snap-old0001',
              },
            },
          ],
        },
        {
          ImageId: 'ami-old0002',
          CreationDate: date31DaysAgo.toISOString(),
        },
        {
          ImageId: 'ami-notOld0001',
          CreationDate: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString(),
          BlockDeviceMappings: [
            {
              Ebs: {
                SnapshotId: 'snap-notOld0001',
              },
            },
          ],
        },
      ],
    });

    await amiCleanup({
      minimumDaysOld: deleteAmisOlderThenDays,
      ssmParameterNames: ['*ami-id'],
    });
    expect(mockEC2Client).toHaveReceivedCommandTimes(DeregisterImageCommand, 2);
    expect(mockEC2Client).toHaveReceivedCommandWith(DeregisterImageCommand, {
      ImageId: 'ami-old0001',
    });
    expect(mockEC2Client).toHaveReceivedCommandWith(DeleteSnapshotCommand, {
      SnapshotId: 'snap-old0001',
    });
    expect(mockEC2Client).toHaveReceivedCommandWith(DeregisterImageCommand, {
      ImageId: 'ami-old0002',
    });
    expect(mockEC2Client).not.toHaveReceivedCommandWith(DeregisterImageCommand, {
      ImageId: 'ami-notOld0001',
    });
    expect(mockEC2Client).not.toHaveReceivedCommandWith(DeleteSnapshotCommand, {
      SnapshotId: 'snap-notOld0001',
    });

    expect(mockEC2Client).toHaveReceivedCommandTimes(DeleteSnapshotCommand, 1);
  });

  it('should delete 1 AMIs AMI.', async () => {
    mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
      Images: [
        {
          ImageId: 'ami-old0001',
          CreationDate: date31DaysAgo.toISOString(),
        },
      ],
    });

    await amiCleanup({
      minimumDaysOld: deleteAmisOlderThenDays,
      ssmParameterNames: ['*ami-id'],
      maxItems: 1,
    });
    expect(mockEC2Client).toHaveReceivedCommandTimes(DeregisterImageCommand, 1);
    expect(mockEC2Client).toHaveReceivedCommandWith(DeregisterImageCommand, {
      ImageId: 'ami-old0001',
    });
    expect(mockEC2Client).not.toHaveReceivedCommand(DeleteSnapshotCommand);
  });

  it('should not delete a snapshot if ami deletion fails.', async () => {
    mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
      Images: [
        ...imagesInUse,
        {
          ImageId: 'ami-old0001',
          CreationDate: date31DaysAgo.toISOString(),
          BlockDeviceMappings: [
            {
              Ebs: {
                SnapshotId: 'snap-old0001',
              },
            },
          ],
        },
      ],
    });

    mockEC2Client.on(DeregisterImageCommand).rejects({});

    await amiCleanup({ ssmParameterNames: ['*ami-id'] }).catch(() => fail());
    expect(mockEC2Client).toHaveReceivedCommandTimes(DeregisterImageCommand, 1);
    expect(mockEC2Client).not.toHaveReceivedCommand(DeleteSnapshotCommand);
  });

  it('should not fail when deleting a snahshot fails.', async () => {
    mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
      Images: [
        ...imagesInUse,
        {
          ImageId: 'ami-old0001',
          CreationDate: date31DaysAgo.toISOString(),
          BlockDeviceMappings: [
            {
              Ebs: {
                SnapshotId: 'snap-old0001',
              },
            },
          ],
        },
      ],
    });

    mockEC2Client.on(DeleteSnapshotCommand).rejects({});

    await amiCleanup({ ssmParameterNames: ['*ami-id'] }).catch(() => fail());
    expect(mockEC2Client).toHaveReceivedCommandTimes(DeregisterImageCommand, 1);
    expect(mockEC2Client).toHaveReceivedCommandTimes(DeleteSnapshotCommand, 1);
  });

  it('should not delete AMIs referenced via resolve:ssm in launch templates.', async () => {
    // The only AMI owned by the account and older than the age threshold
    mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
      Images: [
        {
          ImageId: 'ami-resolvesm0001',
          CreationDate: date31DaysAgo.toISOString(),
        },
      ],
    });

    // Launch template that ultimately resolves to the AMI ID via
    // `resolve:ssm:`. Because the Lambda uses the EC2 `ResolveAlias` flag, the
    // ImageId that we receive from the API will already be resolved to the real
    // AMI ID.
    mockEC2Client.on(DescribeLaunchTemplatesCommand).resolves({
      LaunchTemplates: [
        {
          LaunchTemplateId: 'lt-resolve',
          LaunchTemplateName: 'lt-resolve',
          DefaultVersionNumber: 1,
          LatestVersionNumber: 1,
        },
      ],
    });

    mockEC2Client
      .on(DescribeLaunchTemplateVersionsCommand, {
        LaunchTemplateId: 'lt-resolve',
      })
      .resolves({
        LaunchTemplateVersions: [
          {
            LaunchTemplateId: 'lt-resolve',
            LaunchTemplateName: 'lt-resolve',
            VersionNumber: 1,
            LaunchTemplateData: {
              ImageId: 'ami-resolvesm0001', // resolved alias
            },
          },
        ],
      });

    // Run cleanup with same age threshold to force consideration of the AMI
    await amiCleanup({
      minimumDaysOld: 0,
      launchTemplateNames: ['lt-resolve'],
    });

    expect(mockEC2Client).not.toHaveReceivedCommand(DeregisterImageCommand);
  });

  it('uses ResolveAlias flag in launch template version calls', async () => {
    mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
      Images: [],
    });

    mockEC2Client.on(DescribeLaunchTemplatesCommand).resolves({
      LaunchTemplates: [
        {
          LaunchTemplateId: 'lt-test',
          LaunchTemplateName: 'lt-test',
          DefaultVersionNumber: 1,
          LatestVersionNumber: 1,
        },
      ],
    });

    mockEC2Client.on(DescribeLaunchTemplateVersionsCommand).resolves({
      LaunchTemplateVersions: [
        {
          LaunchTemplateId: 'lt-test',
          LaunchTemplateName: 'lt-test',
          VersionNumber: 1,
          LaunchTemplateData: {
            ImageId: 'ami-resolved',
          },
        },
      ],
    });

    await amiCleanup({
      launchTemplateNames: ['lt-test'],
    });

    // Verify that ResolveAlias: true was passed to the command
    expect(mockEC2Client).toHaveReceivedCommandWith(DescribeLaunchTemplateVersionsCommand, {
      LaunchTemplateId: 'lt-test',
      Versions: ['$Default'],
      ResolveAlias: true,
    });
  });

  describe('SSM Parameter Handling', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      mockEC2Client.reset();
      mockSSMClient.reset();

      // Default setup for launch templates (empty)
      mockEC2Client.on(DescribeLaunchTemplatesCommand).resolves({
        LaunchTemplates: [],
      });
    });

    it('handles explicit SSM parameter names (ami_id with underscore)', async () => {
      // Setup AMI that would be deleted if not referenced
      mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
        Images: [
          {
            ImageId: 'ami-underscore0001',
            CreationDate: date31DaysAgo.toISOString(),
          },
        ],
      });

      mockSSMClient.on(GetParameterCommand, { Name: '/github-runner/config/ami_id' }).resolves({
        Parameter: {
          Name: '/github-runner/config/ami_id',
          Type: 'String',
          Value: 'ami-underscore0001',
          Version: 1,
        },
      });

      await amiCleanup({
        minimumDaysOld: 0,
        ssmParameterNames: ['/github-runner/config/ami_id'],
      });

      // AMI should not be deleted because it's referenced in SSM
      expect(mockEC2Client).not.toHaveReceivedCommand(DeregisterImageCommand);
      expect(mockSSMClient).toHaveReceivedCommandWith(GetParameterCommand, {
        Name: '/github-runner/config/ami_id',
      });
      expect(mockSSMClient).not.toHaveReceivedCommand(DescribeParametersCommand);
    });

    it('handles explicit SSM parameter names (ami-id with hyphen)', async () => {
      // AMI that would be deleted if not referenced
      mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
        Images: [
          {
            ImageId: 'ami-hyphen0001',
            CreationDate: date31DaysAgo.toISOString(),
          },
        ],
      });

      mockSSMClient.on(GetParameterCommand, { Name: '/github-runner/config/ami-id' }).resolves({
        Parameter: {
          Name: '/github-runner/config/ami-id',
          Type: 'String',
          Value: 'ami-hyphen0001',
          Version: 1,
        },
      });

      await amiCleanup({
        minimumDaysOld: 0,
        ssmParameterNames: ['/github-runner/config/ami-id'],
      });

      // AMI should not be deleted because it's referenced in SSM
      expect(mockEC2Client).not.toHaveReceivedCommand(DeregisterImageCommand);
      expect(mockSSMClient).toHaveReceivedCommandWith(GetParameterCommand, {
        Name: '/github-runner/config/ami-id',
      });
      expect(mockSSMClient).not.toHaveReceivedCommand(DescribeParametersCommand);
    });

    it('handles wildcard SSM parameter patterns (*ami-id)', async () => {
      // AMI that would be deleted if not referenced
      mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
        Images: [
          {
            ImageId: 'ami-wildcard0001',
            CreationDate: date31DaysAgo.toISOString(),
          },
        ],
      });

      mockSSMClient.on(DescribeParametersCommand).resolves({
        Parameters: [
          {
            Name: '/some/path/ami-id',
            Type: 'String',
            Version: 1,
          },
        ],
      });

      mockSSMClient.on(GetParameterCommand, { Name: '/some/path/ami-id' }).resolves({
        Parameter: {
          Name: '/some/path/ami-id',
          Type: 'String',
          Value: 'ami-wildcard0001',
          Version: 1,
        },
      });

      await amiCleanup({
        minimumDaysOld: 0,
        ssmParameterNames: ['*ami-id'],
      });

      // AMI should not be deleted because it's referenced in SSM
      expect(mockEC2Client).not.toHaveReceivedCommand(DeregisterImageCommand);
      expect(mockSSMClient).toHaveReceivedCommandWith(DescribeParametersCommand, {
        ParameterFilters: [{ Key: 'Name', Option: 'Contains', Values: ['ami-id'] }],
      });
      expect(mockSSMClient).toHaveReceivedCommandWith(GetParameterCommand, {
        Name: '/some/path/ami-id',
      });
    });

    it('handles wildcard SSM parameter patterns (*ami_id)', async () => {
      // AMI that would be deleted if not referenced
      mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
        Images: [
          {
            ImageId: 'ami-wildcard-underscore0001',
            CreationDate: date31DaysAgo.toISOString(),
          },
        ],
      });

      mockSSMClient.on(DescribeParametersCommand).resolves({
        Parameters: [
          {
            Name: '/github-runner/config/ami_id',
            Type: 'String',
            Version: 1,
          },
        ],
      });

      mockSSMClient.on(GetParameterCommand, { Name: '/github-runner/config/ami_id' }).resolves({
        Parameter: {
          Name: '/github-runner/config/ami_id',
          Type: 'String',
          Value: 'ami-wildcard-underscore0001',
          Version: 1,
        },
      });

      await amiCleanup({
        minimumDaysOld: 0,
        ssmParameterNames: ['*ami_id'],
      });

      // AMI should not be deleted because it's referenced in SSM
      expect(mockEC2Client).not.toHaveReceivedCommand(DeregisterImageCommand);
      expect(mockSSMClient).toHaveReceivedCommandWith(DescribeParametersCommand, {
        ParameterFilters: [{ Key: 'Name', Option: 'Contains', Values: ['ami_id'] }],
      });
      expect(mockSSMClient).toHaveReceivedCommandWith(GetParameterCommand, {
        Name: '/github-runner/config/ami_id',
      });
    });

    it('handles mixed explicit names and wildcard patterns', async () => {
      // AMIs that would be deleted if not referenced
      mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
        Images: [
          {
            ImageId: 'ami-explicit0001',
            CreationDate: date31DaysAgo.toISOString(),
          },
          {
            ImageId: 'ami-wildcard0001',
            CreationDate: date31DaysAgo.toISOString(),
          },
          {
            ImageId: 'ami-unused0001',
            CreationDate: date31DaysAgo.toISOString(),
          },
        ],
      });

      mockSSMClient.on(GetParameterCommand, { Name: '/explicit/ami_id' }).resolves({
        Parameter: {
          Name: '/explicit/ami_id',
          Type: 'String',
          Value: 'ami-explicit0001',
          Version: 1,
        },
      });

      mockSSMClient.on(DescribeParametersCommand).resolves({
        Parameters: [
          {
            Name: '/discovered/ami-id',
            Type: 'String',
            Version: 1,
          },
        ],
      });

      mockSSMClient.on(GetParameterCommand, { Name: '/discovered/ami-id' }).resolves({
        Parameter: {
          Name: '/discovered/ami-id',
          Type: 'String',
          Value: 'ami-wildcard0001',
          Version: 1,
        },
      });

      await amiCleanup({
        minimumDaysOld: 0,
        ssmParameterNames: ['/explicit/ami_id', '*ami-id'],
      });

      // Only the unused AMI should be deleted
      expect(mockEC2Client).toHaveReceivedCommandTimes(DeregisterImageCommand, 1);
      expect(mockEC2Client).toHaveReceivedCommandWith(DeregisterImageCommand, {
        ImageId: 'ami-unused0001',
      });

      expect(mockSSMClient).toHaveReceivedCommandWith(GetParameterCommand, {
        Name: '/explicit/ami_id',
      });
      expect(mockSSMClient).toHaveReceivedCommandWith(DescribeParametersCommand, {
        ParameterFilters: [{ Key: 'Name', Option: 'Contains', Values: ['ami-id'] }],
      });
      expect(mockSSMClient).toHaveReceivedCommandWith(GetParameterCommand, {
        Name: '/discovered/ami-id',
      });
    });

    it('handles SSM parameter fetch failures gracefully', async () => {
      // AMI that would be deleted if not referenced
      mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
        Images: [
          {
            ImageId: 'ami-failure0001',
            CreationDate: date31DaysAgo.toISOString(),
          },
        ],
      });

      mockSSMClient.on(GetParameterCommand, { Name: '/nonexistent/ami_id' }).rejects(new Error('ParameterNotFound'));

      // Should not throw and should delete the AMI since SSM reference failed
      await amiCleanup({
        minimumDaysOld: 0,
        ssmParameterNames: ['/nonexistent/ami_id'],
      });

      expect(mockEC2Client).toHaveReceivedCommandWith(DeregisterImageCommand, {
        ImageId: 'ami-failure0001',
      });
    });

    it('handles DescribeParameters failures gracefully for wildcards', async () => {
      // AMI that would be deleted if not referenced
      mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
        Images: [
          {
            ImageId: 'ami-describe-failure0001',
            CreationDate: date31DaysAgo.toISOString(),
          },
        ],
      });

      mockSSMClient.on(DescribeParametersCommand).rejects(new Error('AccessDenied'));

      // Should not throw and should delete the AMI since SSM discovery failed
      await amiCleanup({
        minimumDaysOld: 0,
        ssmParameterNames: ['*ami-id'],
      });

      expect(mockEC2Client).toHaveReceivedCommandWith(DeregisterImageCommand, {
        ImageId: 'ami-describe-failure0001',
      });
    });

    it('handles empty SSM parameter lists', async () => {
      // AMI that should be deleted
      mockEC2Client.on(DescribeImagesCommand, { Owners: ['self'] }).resolves({
        Images: [
          {
            ImageId: 'ami-no-ssm0001',
            CreationDate: date31DaysAgo.toISOString(),
          },
        ],
      });

      await amiCleanup({
        minimumDaysOld: 0,
        ssmParameterNames: [],
      });

      // AMI should be deleted since no SSM parameters are checked
      expect(mockEC2Client).toHaveReceivedCommandWith(DeregisterImageCommand, {
        ImageId: 'ami-no-ssm0001',
      });
      expect(mockSSMClient).not.toHaveReceivedCommand(DescribeParametersCommand);
      expect(mockSSMClient).not.toHaveReceivedCommand(GetParameterCommand);
    });
  });
});

import {
  DeleteSnapshotCommand,
  DeregisterImageCommand,
  DescribeImagesCommand,
  DescribeLaunchTemplateVersionsCommand,
  DescribeLaunchTemplatesCommand,
  EC2Client,
  Filter,
  Image,
} from '@aws-sdk/client-ec2';
import { GetParameterCommand, SSMClient, DescribeParametersCommand } from '@aws-sdk/client-ssm';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { getTracedAWSV3Client } from '@aws-github-runner/aws-powertools-util';

const logger = createChildLogger('ami');

export interface AmiCleanupOptions {
  minimumDaysOld?: number;
  maxItems?: number;
  amiFilters?: Filter[];
  launchTemplateNames?: string[];
  ssmParameterNames?: string[];
  dryRun?: boolean;
}

interface AmiCleanupOptionsInternal extends AmiCleanupOptions {
  minimumDaysOld: number;
  maxItems: number;
  amiFilters: Filter[];
  launchTemplateNames: string[];
  ssmParameterNames: string[];
  dryRun: boolean;
}

export const defaultAmiCleanupOptions: AmiCleanupOptions = {
  minimumDaysOld: 30,
  maxItems: undefined,
  amiFilters: [
    {
      Name: 'state',
      Values: ['available'],
    },
    {
      Name: 'image-type',
      Values: ['machine'],
    },
  ],
  launchTemplateNames: undefined,
  ssmParameterNames: undefined,
  dryRun: false,
};

function applyDefaults(options: AmiCleanupOptions): AmiCleanupOptions {
  return {
    minimumDaysOld: options.minimumDaysOld ?? defaultAmiCleanupOptions.minimumDaysOld,
    maxItems: options.maxItems ?? defaultAmiCleanupOptions.maxItems,
    amiFilters: options.amiFilters ?? defaultAmiCleanupOptions.amiFilters,
    launchTemplateNames: options.launchTemplateNames ?? defaultAmiCleanupOptions.launchTemplateNames,
    ssmParameterNames: options.ssmParameterNames ?? defaultAmiCleanupOptions.ssmParameterNames,
    dryRun: options.dryRun ?? defaultAmiCleanupOptions.dryRun,
  };
}

/**
 * Clean up old AMIs that are not actively used.
 *
 * 1. Identify AMIs that are not referenced in Launch Templates or SSM
 *    parameters
 * 2. Keep AMIs newer than the specified age threshold
 * 3. Delete the remaining AMIs and their associated snapshots
 *
 * @param options Configuration for the cleanup process
 */
async function amiCleanup(options: AmiCleanupOptions): Promise<void> {
  const mergedOptions = applyDefaults(options) as AmiCleanupOptionsInternal;
  logger.info(`Cleaning up non used AMIs older then ${mergedOptions.minimumDaysOld} days`);
  logger.debug('Using the following options', { options: mergedOptions });

  // Identify AMIs that are safe to delete (not referenced anywhere)
  const amisNotInUse = await getAmisNotInUse(mergedOptions);

  // Delete each AMI with a small delay to avoid overwhelming the API
  for (const image of amisNotInUse) {
    await new Promise((resolve) => setTimeout(resolve, 100)); // Rate limiting
    await deleteAmi(image, mergedOptions);
  }
}

/**
 * Filter out AMIs that are currently in use.
 *
 * 1. Discover AMIs referenced in SSM parameters (both explicit and wildcard
 *    patterns)
 * 2. Discover AMIs referenced in Launch Templates
 * 3. Get all account-owned AMIs matching the provided filters
 * 4. Exclude AMIs from (1) and (2)
 *
 * @param options Configuration for the cleanup process
 * @returns Array of AMI objects that are not referenced and eligible for
 *          deletion
 */
async function getAmisNotInUse(options: AmiCleanupOptions): Promise<Image[]> {
  // Concurrently discover AMIs that are actively referenced and should be preserved
  const amiIdsInSSM = await getAmisReferedInSSM(options);
  const amiIdsInTemplates = await getAmiInLatestTemplates(options);

  // Fetch all account-owned AMIs that match the specified filters
  const ec2Client = getTracedAWSV3Client(new EC2Client({}));
  logger.debug('Getting all AMIs from ec2 with filters', { filters: options.amiFilters });
  const amiEc2 = await ec2Client.send(
    new DescribeImagesCommand({
      Owners: ['self'], // Only consider AMIs owned by this account
      MaxResults: options.maxItems ? options.maxItems : undefined,
      Filters: options.amiFilters, // Apply additional filters (e.g., state=available)
    }),
  );
  logger.debug('Found the following AMIs', { amiEc2 });

  // sort oldest first
  amiEc2.Images?.sort((a, b) => {
    if (a.CreationDate && b.CreationDate) {
      return new Date(a.CreationDate).getTime() - new Date(b.CreationDate).getTime();
    } else {
      return 0;
    }
  });

  logger.info(`found #${amiEc2.Images?.length} images in ec2`);
  logger.info(`found #${amiIdsInSSM.length} images referenced in SSM`);
  logger.info(`found #${amiIdsInTemplates.length} images in latest versions of launch templates`);

  // Filter out AMIs that are referenced in either SSM parameters or Launch
  // Templates.
  const filteredAmiEc2 =
    amiEc2.Images?.filter(
      (image) => !amiIdsInSSM.includes(image.ImageId) && !amiIdsInTemplates.includes(image.ImageId),
    ) ?? [];

  logger.info(`found #${filteredAmiEc2.length} images in ec2 not in use.`);

  return filteredAmiEc2;
}

async function deleteAmi(amiDetails: Image, options: AmiCleanupOptionsInternal): Promise<void> {
  // check if ami is older then 30 days
  const creationDate = amiDetails.CreationDate ? new Date(amiDetails.CreationDate) : undefined;
  const minimumDaysOldDate = new Date();
  minimumDaysOldDate.setDate(minimumDaysOldDate.getDate() - options.minimumDaysOld);
  if (!creationDate) {
    logger.warn(`ami ${amiDetails.ImageId} has no creation date`);
    return;
  } else if (creationDate > minimumDaysOldDate) {
    logger.debug(
      `ami ${amiDetails.Name || amiDetails.ImageId} created on ${amiDetails.CreationDate} is not deleted, ` +
        `not older then ${options.minimumDaysOld} days`,
    );
    return;
  }

  try {
    logger.info(`deleting ami ${amiDetails.Name || amiDetails.ImageId} created at ${amiDetails.CreationDate}`);
    const ec2Client = getTracedAWSV3Client(new EC2Client({}));
    await ec2Client.send(new DeregisterImageCommand({ ImageId: amiDetails.ImageId, DryRun: options.dryRun }));
    await deleteSnapshot(options, amiDetails, ec2Client);
  } catch (error) {
    logger.warn(`Cannot delete ami ${amiDetails.Name || amiDetails.ImageId}`);
    logger.debug(`Cannot delete ami ${amiDetails.Name || amiDetails.ImageId}`, { error });
  }
}

async function deleteSnapshot(options: AmiCleanupOptions, amiDetails: Image, ec2Client: EC2Client) {
  amiDetails.BlockDeviceMappings?.map(async (blockDeviceMapping) => {
    const snapshotId = blockDeviceMapping.Ebs?.SnapshotId;
    if (snapshotId) {
      try {
        logger.info(`deleting snapshot ${snapshotId} from ami ${amiDetails.ImageId}`);
        await ec2Client.send(new DeleteSnapshotCommand({ SnapshotId: snapshotId, DryRun: options.dryRun }));
      } catch (error) {
        logger.error(`Cannot delete snapshot ${snapshotId} for ${amiDetails.Name || amiDetails.ImageId}`);
        logger.debug(`Cannot delete snapshot ${snapshotId} for ${amiDetails.Name || amiDetails.ImageId}`, { error });
      }
    }
  });
}

/**
 * Resolves the value of an SSM parameter by its name. Doesn't fail on errors,
 * but warns instead, as this process is best-effort.
 *
 * @param name - The SSM parameter name to resolve
 * @param ssmClient - Configured SSM client for making API calls
 * @returns The parameter value if successful, undefined if parameter doesn't exist or access fails
 */
async function resolveSsmParameterValue(name: string, ssmClient: SSMClient): Promise<string | undefined> {
  try {
    const { Parameter: parameter } = await ssmClient.send(new GetParameterCommand({ Name: name }));

    return parameter?.Value;
  } catch (error: unknown) {
    logger.warn(`Failed to resolve image id from SSM parameter ${name}`, { error });

    return undefined;
  }
}

/**
 * Retrieve AMI IDs referenced in Launch Templates.
 *
 * Discover AMI IDs that are actively used in Launch Templates, which indicates
 * they should not be cleaned up.
 *
 * @param options - Cleanup configuration including optional launch template name filters
 * @returns Array of AMI IDs found in launch templates (may contain undefined values)
 */
async function getAmiInLatestTemplates(options: AmiCleanupOptions): Promise<(string | undefined)[]> {
  const ec2Client = getTracedAWSV3Client(new EC2Client({}));

  // Discover launch templates, optionally filtered by specific names. If no
  // names provided, this will return all launch templates in the account
  logger.debug('Describing launch templates', {
    launchTemplateNames: options.launchTemplateNames,
  });
  const launchTemplates = await ec2Client.send(
    new DescribeLaunchTemplatesCommand({
      LaunchTemplateNames: options.launchTemplateNames,
    }),
  );
  logger.debug('Found launch templates', { launchTemplates });

  // For each template, fetch the default version and resolve any SSM aliases.
  const amiIdsNested = await Promise.all(
    (launchTemplates.LaunchTemplates ?? []).map(async (template) => {
      const versionsResp = await ec2Client.send(
        new DescribeLaunchTemplateVersionsCommand({
          LaunchTemplateId: template.LaunchTemplateId,
          Versions: ['$Default'], // Only check the default version
          // This means that references like `resolve:ssm:<parameter arn>` are
          // dereferenced.
          ResolveAlias: true,
        }),
      );

      logger.debug('Found launch template versions', { versionsResp });
      return (versionsResp.LaunchTemplateVersions ?? []).map((v) => v.LaunchTemplateData?.ImageId);
    }),
  );

  logger.debug('Found AMIs in launch templates', { amiIdsNested });
  return amiIdsNested.flat();
}

/**
 * Retrieve AMI IDs referenced in SSM Parameters.
 *
 * Resolve AMI IDs stored in SSM parameters, supporting both literal parameter
 * names and wildcard patterns.
 *
 * @param options - Cleanup configuration including SSM parameter names/patterns to check
 * @returns Array of AMI IDs found in SSM parameters (may contain undefined values)
 */
async function getAmisReferedInSSM(options: AmiCleanupOptions): Promise<(string | undefined)[]> {
  if (!options.ssmParameterNames || options.ssmParameterNames.length === 0) {
    return [];
  }

  const ssmClient = getTracedAWSV3Client(new SSMClient({}));

  // Categorise parameter names into two groups for different handling strategies:
  // 1. Explicit names: Direct parameter lookups (e.g.,
  //    "/github-runner/config/ami_id"). These can be looked up directly.
  // 2. Wildcard patterns: Require parameter discovery first (e.g., "*ami-id",
  //    "*ami_id"). For these, we need to enumerate.
  const explicitNames = options.ssmParameterNames.filter((n) => !n.startsWith('*'));
  const wildcardPatterns = options.ssmParameterNames.filter((n) => n.startsWith('*'));

  const explicitValuesPromise = Promise.all(explicitNames.map((name) => resolveSsmParameterValue(name, ssmClient)));

  // Handle wildcard patterns by first discovering matching parameters, then
  // fetching their values
  let wildcardValues: Promise<(string | undefined)[]> = Promise.resolve([]);
  if (wildcardPatterns.length > 0) {
    // Convert wildcard patterns to SSM ParameterFilters using Contains logic
    // Example: "*ami-id" becomes a filter for parameters containing "ami-id"
    const filters = wildcardPatterns.map((p) => ({
      Key: 'Name',
      Option: 'Contains',
      Values: [p.replace(/^\*/g, '')],
    }));

    try {
      // Discover parameters matching the wildcard patterns
      logger.debug('Describing SSM parameter', { filters });
      const ssmParameters = await ssmClient.send(new DescribeParametersCommand({ ParameterFilters: filters }));

      // Fetch the actual values of discovered parameters
      wildcardValues = Promise.all(
        (ssmParameters.Parameters ?? []).map((param) => resolveSsmParameterValue(param.Name!, ssmClient)),
      );
    } catch (e) {
      logger.warn('Failed to describe SSM parameters using wildcard patterns', { error: e });
    }
  }

  // Combine results from both explicit and wildcard parameter resolution
  const values = await Promise.all([explicitValuesPromise, wildcardValues]);
  logger.debug('Resolved SSM parameter values', { values });
  return values.flat();
}

export { amiCleanup, getAmisNotInUse };

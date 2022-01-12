import yn from 'yn';
import { logger as rootLogger } from './../logger';
import { createRunners } from '../scale-runners/scale-up';
import { createGithubAppAuth, createGithubInstallationAuth, createOctoClient } from '../gh-auth/gh-auth';
import { listEC2Runners } from '../aws/runners';

const logger = rootLogger.getChildLogger({ name: 'simple-pool' });

export interface SimplePoolEvent {
  simplePoolSize: number;
}

export async function adjust(event: SimplePoolEvent): Promise<void> {
  logger.info(`Adjusting simple pool of size: ${event.simplePoolSize}`);
  const runnerExtraLabels = process.env.RUNNER_EXTRA_LABELS;
  const runnerGroup = process.env.RUNNER_GROUP_NAME;
  const environment = process.env.ENVIRONMENT;
  const ghesBaseUrl = process.env.GHES_URL;
  const subnets = process.env.SUBNET_IDS.split(',');
  const instanceTypes = process.env.INSTANCE_TYPES.split(',');
  const instanceTargetTargetCapacityType = process.env.INSTANCE_TARGET_CAPACITY_TYPE;
  const ephemeral = yn(process.env.ENABLE_EPHEMERAL_RUNNERS, { default: false });
  const launchTemplateName = process.env.LAUNCH_TEMPLATE_NAME;
  const instanceMaxSpotPrice = process.env.INSTANCE_MAX_SPOT_PRICE;
  const instanceAllocationStrategy = process.env.INSTANCE_ALLOCATION_STRATEGY || 'lowest-price'; // same as AWS default
  const runnerOwner = process.env.RUNNER_OWNER;

  let ghesApiUrl = '';
  if (ghesBaseUrl) {
    ghesApiUrl = `${ghesBaseUrl}/api/v3`;
  }

  const installationId = await getInstallationId(ghesApiUrl, runnerOwner);
  const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
  const githubInstallationClient = await createOctoClient(ghAuth.token, ghesApiUrl);

  // Look up the runners registered in GitHub, could be also non managed by this module.
  const runners = await githubInstallationClient.paginate(
    githubInstallationClient.actions.listSelfHostedRunnersForOrg,
    {
      org: runnerOwner,
      per_page: 100,
    },
  );
  const idleRunners = runners.filter((r) => !r.busy && r.status === 'online').map((r) => r.name);

  // Look up the managed ec2 runners in AWS, but running does not mean idle
  const ec2runners = (
    await listEC2Runners({
      environment,
      runnerOwner,
      runnerType: 'Org',
      statuses: ['running'],
    })
  ).map((r) => r.instanceId);

  const managedIdleRunners = ec2runners.filter((r) => idleRunners.includes(r));
  const topUp = event.simplePoolSize - managedIdleRunners.length;
  if (topUp > 0) {
    logger.info(`The pool will be topped up with ${topUp} runners.`);
    await createRunners(
      { ephemeral, ghesBaseUrl, runnerExtraLabels, runnerGroup, runnerOwner, runnerType: 'Org' },
      {
        ec2instanceCriteria: {
          instanceTypes,
          targetCapacityType: instanceTargetTargetCapacityType,
          maxSpotPrice: instanceMaxSpotPrice,
          instanceAllocationStrategy: instanceAllocationStrategy,
        },
        environment,
        launchTemplateName,
        subnets,
        numberOfRunners: topUp,
      },
      githubInstallationClient,
    );
  } else {
    logger.info(`Pool will not be topped up. Find ${managedIdleRunners} managed idle runners.`);
  }
}

async function getInstallationId(ghesApiUrl: string, org: string): Promise<number> {
  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubClient = await createOctoClient(ghAuth.token, ghesApiUrl);

  return (
    await githubClient.apps.getOrgInstallation({
      org,
    })
  ).data.id;
}

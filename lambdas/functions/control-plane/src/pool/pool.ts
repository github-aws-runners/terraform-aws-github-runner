import { createChildLogger } from '@terraform-aws-github-runner/aws-powertools-util';
import yn from 'yn';

import { bootTimeExceeded, listEC2Runners } from '../aws/runners';
import { createGithubAppAuth, createGithubInstallationAuth, createOctoClient } from '../gh-auth/gh-auth';
import { createRunners } from '../scale-runners/scale-up';

const logger = createChildLogger('pool');

export interface PoolEvent {
  poolSize: number;
}

interface RunnerStatus {
  busy: boolean;
  status: string;
}

export async function adjust(event: PoolEvent): Promise<void> {
  logger.info(`Checking current pool size against pool of size: ${event.poolSize}`);
  const runnerLabels = process.env.RUNNER_LABELS || '';
  const runnerGroup = process.env.RUNNER_GROUP_NAME || '';
  const runnerNamePrefix = process.env.RUNNER_NAME_PREFIX || '';
  const environment = process.env.ENVIRONMENT;
  const ghesBaseUrl = process.env.GHES_URL;
  const ssmTokenPath = process.env.SSM_TOKEN_PATH;
  const ssmConfigPath = process.env.SSM_CONFIG_PATH || '';
  const subnets = process.env.SUBNET_IDS.split(',');
  const instanceTypes = process.env.INSTANCE_TYPES.split(',');
  const instanceTargetTargetCapacityType = process.env.INSTANCE_TARGET_CAPACITY_TYPE;
  const ephemeral = yn(process.env.ENABLE_EPHEMERAL_RUNNERS, { default: false });
  const enableJitConfig = yn(process.env.ENABLE_JIT_CONFIG, { default: ephemeral });
  const disableAutoUpdate = yn(process.env.DISABLE_RUNNER_AUTOUPDATE, { default: false });
  const launchTemplateName = process.env.LAUNCH_TEMPLATE_NAME;
  const instanceMaxSpotPrice = process.env.INSTANCE_MAX_SPOT_PRICE;
  const instanceAllocationStrategy = process.env.INSTANCE_ALLOCATION_STRATEGY || 'lowest-price'; // same as AWS default
  const runnerOwner = process.env.RUNNER_OWNER;
  const amiIdSsmParameterName = process.env.AMI_ID_SSM_PARAMETER_NAME;

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
  const runnerStatus = new Map<string, RunnerStatus>();
  for (const runner of runners) {
    runner.name = runnerNamePrefix ? runner.name.replace(runnerNamePrefix, '') : runner.name;
    runnerStatus.set(runner.name, { busy: runner.busy, status: runner.status });
  }

  // Look up the managed ec2 runners in AWS, but running does not mean idle
  const ec2runners = await listEC2Runners({
    environment,
    runnerOwner,
    runnerType: 'Org',
    statuses: ['running'],
  });

  // Runner should be considered idle if it is still booting, or is idle in GitHub
  let numberOfRunnersInPool = 0;
  for (const ec2Instance of ec2runners) {
    if (
      runnerStatus.get(ec2Instance.instanceId)?.busy === false &&
      runnerStatus.get(ec2Instance.instanceId)?.status === 'online'
    ) {
      numberOfRunnersInPool++;
      logger.debug(`Runner ${ec2Instance.instanceId} is idle in GitHub and counted as part of the pool`);
    } else if (runnerStatus.get(ec2Instance.instanceId) != null) {
      logger.debug(`Runner ${ec2Instance.instanceId} is not idle in GitHub and NOT counted as part of the pool`);
    } else if (!bootTimeExceeded(ec2Instance)) {
      numberOfRunnersInPool++;
      logger.info(`Runner ${ec2Instance.instanceId} is still booting and counted as part of the pool`);
    } else {
      logger.debug(
        `Runner ${ec2Instance.instanceId} is not idle in GitHub nor booting and not counted as part of the pool`,
      );
    }
  }

  const topUp = event.poolSize - numberOfRunnersInPool;
  if (topUp > 0) {
    logger.info(`The pool will be topped up with ${topUp} runners.`);
    await createRunners(
      {
        ephemeral,
        enableJitConfig,
        ghesBaseUrl,
        runnerLabels,
        runnerGroup,
        runnerOwner,
        runnerNamePrefix,
        runnerType: 'Org',
        disableAutoUpdate: disableAutoUpdate,
        ssmTokenPath,
        ssmConfigPath,
      },
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
        amiIdSsmParameterName,
      },
      githubInstallationClient,
    );
  } else {
    logger.info(`Pool will not be topped up. Found ${numberOfRunnersInPool} managed idle runners.`);
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

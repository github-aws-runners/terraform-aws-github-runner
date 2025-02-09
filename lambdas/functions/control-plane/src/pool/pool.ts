import { Octokit } from '@octokit/rest';
import { GetResponseDataTypeFromEndpointMethod } from '@octokit/types';
import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import yn from 'yn';

import { bootTimeExceeded, listEC2Runners } from '../aws/runners';
import { RunnerList, RunnerType } from '../aws/runners.d';
import { createGithubAppAuth, createGithubInstallationAuth, createOctokitClient } from '../github/auth';
import { createRunners, getGitHubEnterpriseApiUrl } from '../scale-runners/scale-up';

const logger = createChildLogger('pool');

type Repository = GetResponseDataTypeFromEndpointMethod<Octokit['repos']['get']>;

export interface PoolEvent {
  poolSize: number;
}

interface RunnerStatus {
  busy: boolean;
  status: string;
}

function canRunJob(workflowJobLabels: string[], runnerLabels: string[]): boolean {
  runnerLabels = runnerLabels.map((label) => label.toLowerCase());
  const matchLabels = workflowJobLabels.every((wl) => runnerLabels.includes(wl.toLowerCase()));
  const match = workflowJobLabels.length === 0 ? !matchLabels : matchLabels;
  return match;
}

export async function adjust(event: PoolEvent): Promise<void> {
  logger.info(`Checking current pool size against pool of size: ${event.poolSize}`);
  const runnerLabels = process.env.RUNNER_LABELS || '';
  const runnerGroup = process.env.RUNNER_GROUP_NAME || '';
  const runnerNamePrefix = process.env.RUNNER_NAME_PREFIX || '';
  const environment = process.env.ENVIRONMENT;
  const ssmTokenPath = process.env.SSM_TOKEN_PATH;
  const ssmConfigPath = process.env.SSM_CONFIG_PATH || '';
  const subnets = process.env.SUBNET_IDS.split(',');
  const instanceTypes = process.env.INSTANCE_TYPES.split(',');
  const instanceTargetCapacityType = process.env.INSTANCE_TARGET_CAPACITY_TYPE;
  const ephemeral = yn(process.env.ENABLE_EPHEMERAL_RUNNERS, { default: false });
  const enableJitConfig = yn(process.env.ENABLE_JIT_CONFIG, { default: ephemeral });
  const disableAutoUpdate = yn(process.env.DISABLE_RUNNER_AUTOUPDATE, { default: false });
  const launchTemplateName = process.env.LAUNCH_TEMPLATE_NAME;
  const instanceMaxSpotPrice = process.env.INSTANCE_MAX_SPOT_PRICE;
  const instanceAllocationStrategy = process.env.INSTANCE_ALLOCATION_STRATEGY || 'lowest-price'; // same as AWS default
  const runnerOwners = process.env.RUNNER_OWNER.split(',');
  const amiIdSsmParameterName = process.env.AMI_ID_SSM_PARAMETER_NAME;
  const tracingEnabled = yn(process.env.POWERTOOLS_TRACE_ENABLED, { default: false });
  const onDemandFailoverOnError = process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS
    ? (JSON.parse(process.env.ENABLE_ON_DEMAND_FAILOVER_FOR_ERRORS) as [string])
    : [];

  const { ghesApiUrl, ghesBaseUrl } = getGitHubEnterpriseApiUrl();

  for (const runnerOwner of runnerOwners) {
    logger.info(`Checking ${runnerOwner}`);

    const [owner, repo] = runnerOwner.split('/');
    const runnerType = repo === undefined ? 'Org' : 'Repo';

    const installationId = await getInstallationId(ghesApiUrl, owner);
    const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
    const githubInstallationClient = await createOctokitClient(ghAuth.token, ghesApiUrl);

    // Get statusses of runners registed in GitHub
    const runnerStatusses = await getGitHubRegisteredRunnnerStatusses(
      githubInstallationClient,
      runnerOwner,
      runnerType,
      runnerNamePrefix,
    );

    // Look up the managed ec2 runners in AWS, but running does not mean idle
    const ec2runners = await listEC2Runners({
      environment,
      runnerOwner,
      runnerType,
      statuses: ['running'],
    });

    const numberOfRunnersInPool = calculatePooSize(ec2runners, runnerStatusses);
    let topUp = 0;
    if (event.poolSize >= 0) {
      topUp = event.poolSize - numberOfRunnersInPool;
    } else if (event.poolSize === -1) {
      logger.info('Checking for queued jobs to determine pool size');
      let repos;
      if (runnerType === 'Repo') {
        repos = [repo];
      } else {
        // @ts-expect-error The types normalized by paginate are not correct,
        // because they only flatten .data, while in case of listReposAccessibleToInstallation,
        // they should flatten .repositories.
        const reposAccessibleToInstallation = (await githubInstallationClient.paginate(
          githubInstallationClient.apps.listReposAccessibleToInstallation,
          {
            per_page: 100,
          },
        )) as Repository[];
        repos = reposAccessibleToInstallation.filter((repo) => repo.owner.login === owner).map((repo) => repo.name);
      }
      const queuedWorkflowRuns = [];
      for (const repo of repos) {
        const workflowRuns = await githubInstallationClient.paginate(
          githubInstallationClient.actions.listWorkflowRunsForRepo,
          {
            owner,
            repo,
            status: 'queued',
            per_page: 100,
          },
        );
        queuedWorkflowRuns.push(...workflowRuns);
      }
      const queuedJobs = [];
      for (const workflowRun of queuedWorkflowRuns) {
        const jobs = await githubInstallationClient.paginate(
          githubInstallationClient.actions.listJobsForWorkflowRunAttempt,
          {
            owner: workflowRun.repository.owner.login,
            repo: workflowRun.repository.name,
            run_id: workflowRun.id,
            attempt_number: workflowRun.run_attempt || 1,
            per_page: 100,
          },
        );
        queuedJobs.push(...jobs.filter((job) => job.status === 'queued'));
      }
      const numberOfQueuedJobs = queuedJobs.filter((job) => canRunJob(job.labels, runnerLabels.split(','))).length;
      logger.info(`Found ${numberOfQueuedJobs} queued jobs`);
      topUp = numberOfQueuedJobs - numberOfRunnersInPool;
    } else {
      logger.error(`Invalid pool size: ${event.poolSize}`);
    }

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
          runnerType,
          disableAutoUpdate: disableAutoUpdate,
          ssmTokenPath,
          ssmConfigPath,
        },
        {
          ec2instanceCriteria: {
            instanceTypes,
            targetCapacityType: instanceTargetCapacityType,
            maxSpotPrice: instanceMaxSpotPrice,
            instanceAllocationStrategy: instanceAllocationStrategy,
          },
          environment,
          launchTemplateName,
          subnets,
          numberOfRunners: topUp,
          amiIdSsmParameterName,
          tracingEnabled,
          onDemandFailoverOnError,
        },
        githubInstallationClient,
      );
    } else {
      logger.info(`Pool will not be topped up. Found ${numberOfRunnersInPool} managed idle runners.`);
    }
  }
}

async function getInstallationId(ghesApiUrl: string, org: string): Promise<number> {
  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubClient = await createOctokitClient(ghAuth.token, ghesApiUrl);

  return (
    await githubClient.apps.getOrgInstallation({
      org,
    })
  ).data.id;
}

function calculatePooSize(ec2runners: RunnerList[], runnerStatus: Map<string, RunnerStatus>): number {
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
  return numberOfRunnersInPool;
}

async function getGitHubRegisteredRunnnerStatusses(
  ghClient: Octokit,
  runnerOwner: string,
  runnerType: RunnerType,
  runnerNamePrefix: string,
): Promise<Map<string, RunnerStatus>> {
  let runners;
  if (runnerType === 'Repo') {
    const [owner, repo] = runnerOwner.split('/');
    runners = await ghClient.paginate(ghClient.actions.listSelfHostedRunnersForRepo, {
      owner,
      repo,
      per_page: 100,
    });
  } else {
    runners = await ghClient.paginate(ghClient.actions.listSelfHostedRunnersForOrg, {
      org: runnerOwner,
      per_page: 100,
    });
  }
  const runnerStatus = new Map<string, RunnerStatus>();
  for (const runner of runners) {
    runner.name = runnerNamePrefix ? runner.name.replace(runnerNamePrefix, '') : runner.name;
    runnerStatus.set(runner.name, { busy: runner.busy, status: runner.status });
  }
  return runnerStatus;
}

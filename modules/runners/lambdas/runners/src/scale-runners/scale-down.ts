import { Octokit } from '@octokit/rest';
import moment from 'moment';

import { createGithubAppAuth, createGithubInstallationAuth, createOctoClient } from '../gh-auth/gh-auth';
import { LogFields, logger as rootLogger } from '../logger';
import { RunnerInfo, RunnerList, listEC2Runners, terminateRunner } from './../aws/runners';
import { GhRunners, githubCache } from './cache';
import { ScalingDownConfig, getIdleRunnerCount } from './scale-down-config';

const logger = rootLogger.getChildLogger({ name: 'scale-down' });

async function getOrCreateOctokit(runner: RunnerInfo): Promise<Octokit> {
  const key = runner.owner;
  const cachedOctokit = githubCache.clients.get(key);

  if (cachedOctokit) {
    logger.debug(`[createGitHubClientForRunner] Cache hit for ${key}`, LogFields.print());
    return cachedOctokit;
  }

  logger.debug(`[createGitHubClientForRunner] Cache miss for ${key}`, LogFields.print());
  const ghesBaseUrl = process.env.GHES_URL;
  let ghesApiUrl = '';
  if (ghesBaseUrl) {
    ghesApiUrl = `${ghesBaseUrl}/api/v3`;
  }
  const ghAuthPre = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubClientPre = await createOctoClient(ghAuthPre.token, ghesApiUrl);

  const installationId =
    runner.type === 'Org'
      ? (
          await githubClientPre.apps.getOrgInstallation({
            org: runner.owner,
          })
        ).data.id
      : (
          await githubClientPre.apps.getRepoInstallation({
            owner: runner.owner.split('/')[0],
            repo: runner.owner.split('/')[1],
          })
        ).data.id;
  const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
  const octokit = await createOctoClient(ghAuth.token, ghesApiUrl);
  githubCache.clients.set(key, octokit);

  return octokit;
}

async function listGitHubRunners(runner: RunnerInfo): Promise<GhRunners> {
  const key = runner.owner as string;
  const cachedRunners = githubCache.runners.get(key);
  if (cachedRunners) {
    logger.debug(`[listGithubRunners] Cache hit for ${key}`, LogFields.print());
    return cachedRunners;
  }

  logger.debug(`[listGithubRunners] Cache miss for ${key}`, LogFields.print());
  const client = await getOrCreateOctokit(runner);
  const runners =
    runner.type === 'Org'
      ? await client.paginate(client.actions.listSelfHostedRunnersForOrg, {
          org: runner.owner,
          per_page: 100,
        })
      : await client.paginate(client.actions.listSelfHostedRunnersForRepo, {
          owner: runner.owner.split('/')[0],
          repo: runner.owner.split('/')[1],
          per_page: 100,
        });
  githubCache.runners.set(key, runners);

  return runners;
}

function runnerMinimumTimeExceeded(runner: RunnerInfo): boolean {
  const minimumRunningTimeInMinutes = process.env.MINIMUM_RUNNING_TIME_IN_MINUTES;
  const launchTimePlusMinimum = moment(runner.launchTime).utc().add(minimumRunningTimeInMinutes, 'minutes');
  const now = moment(new Date()).utc();
  return launchTimePlusMinimum < now;
}

function bootTimeExceeded(ec2Runner: RunnerInfo): boolean {
  const runnerBootTimeInMinutes = process.env.RUNNER_BOOT_TIME_IN_MINUTES;
  const launchTimePlusBootTime = moment(ec2Runner.launchTime).utc().add(runnerBootTimeInMinutes, 'minutes');
  return launchTimePlusBootTime < moment(new Date()).utc();
}

async function removeRunner(ec2runner: RunnerInfo, ghRunnerId: number): Promise<void> {
  const githubAppClient = await getOrCreateOctokit(ec2runner);
  try {
    const result =
      ec2runner.type === 'Org'
        ? await githubAppClient.actions.deleteSelfHostedRunnerFromOrg({
            runner_id: ghRunnerId,
            org: ec2runner.owner,
          })
        : await githubAppClient.actions.deleteSelfHostedRunnerFromRepo({
            runner_id: ghRunnerId,
            owner: ec2runner.owner.split('/')[0],
            repo: ec2runner.owner.split('/')[1],
          });

    if (result.status == 204) {
      await terminateRunner(ec2runner.instanceId);
      logger.info(
        `AWS runner instance '${ec2runner.instanceId}' is terminated and GitHub runner is de-registered.`,
        LogFields.print(),
      );
    } else {
      logger.error(`Failed to de-register GitHub runner: ${result.status}`, LogFields.print());
    }
  } catch (e) {
    logger.error(`Runner '${ec2runner.instanceId}' cannot be de-registered. Error: ${e}`, LogFields.print());
  }
}

async function evaluateAndRemoveRunners(
  ec2Runners: RunnerInfo[],
  scaleDownConfigs: ScalingDownConfig[],
): Promise<void> {
  let idleCounter = getIdleRunnerCount(scaleDownConfigs);
  const ownerTags = new Set(ec2Runners.map((runner) => runner.owner));

  for (const ownerTag of ownerTags) {
    const ec2RunnersFiltered = ec2Runners.filter((runner) => runner.owner === ownerTag);
    logger.debug(
      `Found: '${ec2RunnersFiltered.length}' active GitHub runners with owner tag: '${ownerTag}'`,
      LogFields.print(),
    );
    for (const ec2Runner of ec2RunnersFiltered) {
      const ghRunners = await listGitHubRunners(ec2Runner);
      const ghRunner = ghRunners.find((runner) => runner.name === ec2Runner.instanceId);
      if (ghRunner) {
        if (!ghRunner.busy && runnerMinimumTimeExceeded(ec2Runner)) {
          if (idleCounter > 0) {
            idleCounter--;
            logger.info(`Runner '${ec2Runner.instanceId}' will be kept idle.`, LogFields.print());
          } else {
            logger.info(`Runner '${ec2Runner.instanceId}' will be terminated.`, LogFields.print());
            await removeRunner(ec2Runner, ghRunner.id);
          }
        }
      } else {
        if (bootTimeExceeded(ec2Runner)) {
          logger.info(`Runner '${ec2Runner.instanceId}' is orphaned and will be removed.`, LogFields.print());
          terminateOrphan(ec2Runner.instanceId);
        } else {
          logger.debug(`Runner ${ec2Runner.instanceId} has not yet booted.`, LogFields.print());
        }
      }
    }
  }
}

async function terminateOrphan(instanceId: string): Promise<void> {
  try {
    await terminateRunner(instanceId);
  } catch (e) {
    logger.debug(`Orphan runner '${instanceId}' cannot be removed.`, LogFields.print());
  }
}

async function listAndSortRunners(environment: string) {
  return (
    await listEC2Runners({
      environment,
    })
  ).sort((a, b): number => {
    if (a.launchTime === undefined) return 1;
    if (b.launchTime === undefined) return 1;
    if (a.launchTime < b.launchTime) return 1;
    if (a.launchTime > b.launchTime) return -1;
    return 0;
  });
}

/**
 * We are moving to a new strategy to find and remove runners, this function will ensure
 * during migration runners tagged in the old way are removed.
 */
function filterLegacyRunners(ec2runners: RunnerList[]): RunnerInfo[] {
  return ec2runners
    .filter((ec2Runner) => ec2Runner.repo || ec2Runner.org)
    .map((ec2Runner) => ({
      instanceId: ec2Runner.instanceId,
      launchTime: ec2Runner.launchTime,
      type: ec2Runner.org ? 'Org' : 'Repo',
      owner: ec2Runner.org ? (ec2Runner.org as string) : (ec2Runner.repo as string),
    }));
}

function filterRunners(ec2runners: RunnerList[]): RunnerInfo[] {
  return ec2runners.filter((ec2Runner) => ec2Runner.type) as RunnerInfo[];
}

export async function scaleDown(): Promise<void> {
  githubCache.reset();
  const scaleDownConfigs = JSON.parse(process.env.SCALE_DOWN_CONFIG) as [ScalingDownConfig];
  const environment = process.env.ENVIRONMENT;

  // list and sort runners, newest first. This ensure we keep the newest runners longer.
  const ec2Runners = await listAndSortRunners(environment);
  const activeEc2RunnersCount = ec2Runners.length;
  logger.info(
    `Found: '${activeEc2RunnersCount}' active GitHub EC2 runner instances before clean-up.`,
    LogFields.print(),
  );

  if (activeEc2RunnersCount === 0) {
    logger.debug(`No active runners found for environment: '${environment}'`, LogFields.print());
    return;
  }
  const legacyRunners = filterLegacyRunners(ec2Runners);
  logger.debug(JSON.stringify(legacyRunners), LogFields.print());
  const runners = filterRunners(ec2Runners);

  await evaluateAndRemoveRunners(runners, scaleDownConfigs);
  await evaluateAndRemoveRunners(legacyRunners, scaleDownConfigs);

  const activeEc2RunnersCountAfter = (await listAndSortRunners(environment)).length;
  logger.info(
    `Found: '${activeEc2RunnersCountAfter}' active GitHub EC2 runners instances after clean-up.`,
    LogFields.print(),
  );
}

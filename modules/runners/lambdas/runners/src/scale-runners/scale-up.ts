import { listEC2Runners, createRunner, RunnerInputParameters } from './../aws/runners';
import { createOctoClient, createGithubAppAuth, createGithubInstallationAuth } from '../gh-auth/gh-auth';
import yn from 'yn';
import { Octokit } from '@octokit/rest';
import { LogFields, logger as rootLogger } from '../logger';
import ScaleError from './ScaleError';

const logger = rootLogger.getChildLogger({ name: 'scale-up' });

export interface ActionRequestMessage {
  id: number;
  eventType: 'check_run' | 'workflow_job';
  repositoryName: string;
  repositoryOwner: string;
  installationId: number;
}

function generateRunnerServiceConfig(
  runnerExtraLabels: string | undefined,
  runnerGroup: string | undefined,
  ghesBaseUrl: string,
  ephemeral: boolean,
  token: any,
  runnerType: 'Org' | 'Repo',
  payload: ActionRequestMessage,
) {
  const labelsArgument = runnerExtraLabels !== undefined ? `--labels ${runnerExtraLabels} ` : '';
  const runnerGroupArgument = runnerGroup !== undefined ? `--runnergroup ${runnerGroup} ` : '';
  const configBaseUrl = ghesBaseUrl ? ghesBaseUrl : 'https://github.com';
  const ephemeralArgument = ephemeral ? '--ephemeral ' : '';
  const runnerArgs = `--token ${token} ${labelsArgument}${ephemeralArgument}`;
  return runnerType === 'Org'
    ? `--url ${configBaseUrl}/${payload.repositoryOwner} ${runnerArgs}${runnerGroupArgument}`.trim()
    : `--url ${configBaseUrl}/${payload.repositoryOwner}/${payload.repositoryName} ${runnerArgs}`.trim();
}

async function getGithubRunnerRegistrationToken(
  enableOrgLevel: boolean,
  githubInstallationClient: Octokit,
  payload: ActionRequestMessage,
) {
  const registrationToken = enableOrgLevel
    ? await githubInstallationClient.actions.createRegistrationTokenForOrg({ org: payload.repositoryOwner })
    : await githubInstallationClient.actions.createRegistrationTokenForRepo({
        owner: payload.repositoryOwner,
        repo: payload.repositoryName,
      });
  const token = registrationToken.data.token;
  return token;
}

async function getInstallationId(ghesApiUrl: string, enableOrgLevel: boolean, payload: ActionRequestMessage) {
  if (payload.installationId !== 0) {
    return payload.installationId;
  }

  const ghAuth = await createGithubAppAuth(undefined, ghesApiUrl);
  const githubClient = await createOctoClient(ghAuth.token, ghesApiUrl);
  return enableOrgLevel
    ? (
        await githubClient.apps.getOrgInstallation({
          org: payload.repositoryOwner,
        })
      ).data.id
    : (
        await githubClient.apps.getRepoInstallation({
          owner: payload.repositoryOwner,
          repo: payload.repositoryName,
        })
      ).data.id;
}

async function isJobQueued(githubInstallationClient: Octokit, payload: ActionRequestMessage): Promise<boolean> {
  let isQueued = false;
  if (payload.eventType === 'workflow_job') {
    const jobForWorkflowRun = await githubInstallationClient.actions.getJobForWorkflowRun({
      job_id: payload.id,
      owner: payload.repositoryOwner,
      repo: payload.repositoryName,
    });
    isQueued = jobForWorkflowRun.data.status === 'queued';
  } else if (payload.eventType === 'check_run') {
    const checkRun = await githubInstallationClient.checks.get({
      check_run_id: payload.id,
      owner: payload.repositoryOwner,
      repo: payload.repositoryName,
    });
    isQueued = checkRun.data.status === 'queued';
  } else {
    throw Error(`Event ${payload.eventType} is not supported`);
  }
  if (!isQueued) {
    logger.info(`Job not queued`, LogFields.print());
  }
  return isQueued;
}

async function createRunners(
  enableOrgLevel: boolean,
  githubInstallationClient: Octokit,
  payload: ActionRequestMessage,
  runnerExtraLabels: string | undefined,
  runnerGroup: string | undefined,
  ghesBaseUrl: string,
  ephemeral: boolean,
  runnerType: 'Org' | 'Repo',
  environment: string,
  runnerOwner: string,
  subnets: string[],
  launchTemplateName: string,
  ec2instanceCriteria: RunnerInputParameters['ec2instanceCriteria'],
): Promise<void> {
  const token = await getGithubRunnerRegistrationToken(enableOrgLevel, githubInstallationClient, payload);

  const runnerServiceConfig = generateRunnerServiceConfig(
    runnerExtraLabels,
    runnerGroup,
    ghesBaseUrl,
    ephemeral,
    token,
    runnerType,
    payload,
  );

  await createRunner({
    environment,
    runnerServiceConfig,
    runnerOwner,
    runnerType,
    subnets,
    launchTemplateName,
    ec2instanceCriteria,
  });
}

export async function scaleUp(eventSource: string, payload: ActionRequestMessage): Promise<void> {
  logger.info(
    `Received ${payload.eventType} from ${payload.repositoryOwner}/${payload.repositoryName}`,
    LogFields.print(),
  );

  if (eventSource !== 'aws:sqs') throw Error('Cannot handle non-SQS events!');
  const enableOrgLevel = yn(process.env.ENABLE_ORGANIZATION_RUNNERS, { default: true });
  const maximumRunners = parseInt(process.env.RUNNERS_MAXIMUM_COUNT || '3');
  const runnerExtraLabels = process.env.RUNNER_EXTRA_LABELS;
  const runnerGroup = process.env.RUNNER_GROUP_NAME;
  const environment = process.env.ENVIRONMENT;
  const ghesBaseUrl = process.env.GHES_URL;
  const subnets = process.env.SUBNET_IDS.split(',');
  const instanceTypes = process.env.INSTANCE_TYPES.split(',');
  const instanceTargetTargetCapacityType = process.env.INSTANCE_TARGET_CAPACITY_TYPE;
  const ephemeralEnabled = yn(process.env.ENABLE_EPHEMERAL_RUNNERS, { default: false });
  const launchTemplateName = process.env.LAUNCH_TEMPLATE_NAME;
  const instanceMaxSpotPrice = process.env.INSTANCE_MAX_SPOT_PRICE;
  const instanceAllocationStrategy = process.env.INSTANCE_ALLOCATION_STRATEGY || 'lowest-price'; // same as AWS default

  if (ephemeralEnabled && payload.eventType !== 'workflow_job') {
    logger.warn(
      `${payload.eventType} event is not supported in combination with ephemeral runners.`,
      LogFields.print(),
    );
    throw Error(
      `The event type ${payload.eventType} is not supported in combination with ephemeral runners.` +
        `Please ensure you have enabled workflow_job events.`,
    );
  }
  const ephemeral = ephemeralEnabled && payload.eventType === 'workflow_job';
  const runnerType = enableOrgLevel ? 'Org' : 'Repo';
  const runnerOwner = enableOrgLevel ? payload.repositoryOwner : `${payload.repositoryOwner}/${payload.repositoryName}`;

  LogFields.fields = {};
  LogFields.fields.runnerType = runnerType;
  LogFields.fields.runnerOwner = runnerOwner;
  LogFields.fields.event = payload.eventType;
  LogFields.fields.id = payload.id.toString();

  logger.info(`Received event`, LogFields.print());

  let ghesApiUrl = '';
  if (ghesBaseUrl) {
    ghesApiUrl = `${ghesBaseUrl}/api/v3`;
  }

  const installationId = await getInstallationId(ghesApiUrl, enableOrgLevel, payload);
  const ghAuth = await createGithubInstallationAuth(installationId, ghesApiUrl);
  const githubInstallationClient = await createOctoClient(ghAuth.token, ghesApiUrl);

  if (ephemeral || (await isJobQueued(githubInstallationClient, payload))) {
    const currentRunners = await listEC2Runners({
      environment,
      runnerType,
      runnerOwner,
    });
    logger.info(`Current runners: ${currentRunners.length} of ${maximumRunners}`, LogFields.print());

    if (currentRunners.length < maximumRunners) {
      logger.info(`Attempting to launch a new runner`, LogFields.print());

      await createRunners(
        enableOrgLevel,
        githubInstallationClient,
        payload,
        runnerExtraLabels,
        runnerGroup,
        ghesBaseUrl,
        ephemeral,
        runnerType,
        environment,
        runnerOwner,
        subnets,
        launchTemplateName,
        {
          instanceTypes,
          targetCapacityType: instanceTargetTargetCapacityType,
          maxSpotPrice: instanceMaxSpotPrice,
          instanceAllocationStrategy: instanceAllocationStrategy,
        },
      );
    } else {
      logger.info('No runner will be created, maximum number of runners reached.', LogFields.print());
      if (ephemeral) {
        throw new ScaleError('No runners create: maximum of runners reached.');
      }
    }
  }
}

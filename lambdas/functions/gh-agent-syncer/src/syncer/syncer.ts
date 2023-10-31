import { GetObjectTaggingCommand, S3Client, ServerSideEncryption, Tag } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Octokit } from '@octokit/rest';
import { createChildLogger } from '@terraform-aws-github-runner/aws-powertools-util';
import { getTracedAWSV3Client } from '@terraform-aws-github-runner/aws-powertools-util';
import axios from 'axios';
import { Stream } from 'stream';

const versionKey = 'name';

const logger = createChildLogger('syncer.ts');

interface CacheObject {
  bucket: string;
  key: string;
}

async function getCachedVersion(s3Client: S3Client, cacheObject: CacheObject): Promise<string | undefined> {
  const command = new GetObjectTaggingCommand({
    Bucket: cacheObject.bucket,
    Key: cacheObject.key,
  });

  try {
    const objectTagging = await s3Client.send(command);
    const versions = objectTagging.TagSet?.filter((t: Tag) => t.Key === versionKey);
    return versions?.length === 1 ? versions[0].Value : undefined;
  } catch (e) {
    logger.debug('No tags found');
    return undefined;
  }
}
interface ReleaseAsset {
  name: string;
  downloadUrl: string;
}

async function getReleaseAsset(runnerOs = 'linux', runnerArch = 'x64'): Promise<ReleaseAsset | undefined> {
  const githubClient = new Octokit();
  const latestRelease = await githubClient.repos.getLatestRelease({
    owner: 'actions',
    repo: 'runner',
  });
  if (!latestRelease || !latestRelease.data) {
    return undefined;
  }

  const releaseVersion = latestRelease.data.tag_name.replace('v', '');
  const assets = latestRelease.data.assets?.filter(
    (a: { name?: string }) => a.name?.includes(`actions-runner-${runnerOs}-${runnerArch}-${releaseVersion}.`),
  );

  return assets?.length === 1 ? { name: assets[0].name, downloadUrl: assets[0].browser_download_url } : undefined;
}

async function uploadToS3(
  s3Client: S3Client,
  cacheObject: CacheObject,
  actionRunnerReleaseAsset: ReleaseAsset,
): Promise<void> {
  const response = await axios.get(actionRunnerReleaseAsset.downloadUrl, {
    responseType: 'stream',
  });

  const passThrough = new Stream.PassThrough();
  response.data.pipe(passThrough);

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: cacheObject.bucket,
      Key: cacheObject.key,
      Tagging: versionKey + '=' + actionRunnerReleaseAsset.name,
      Body: passThrough,
      ServerSideEncryption: process.env.S3_SSE_ALGORITHM as ServerSideEncryption,
    },
  });

  upload.on('httpUploadProgress', () => logger.debug(`Downloading ${actionRunnerReleaseAsset.name} in progress`));
  logger.debug(`Start downloading ${actionRunnerReleaseAsset.name} and uploading to S3.`);
  await upload
    .done()
    .then(() => logger.info(`The new distribution ${actionRunnerReleaseAsset.name} is uploaded to S3.`))
    .catch((e) => logger.error(`Error uploading ${actionRunnerReleaseAsset.name} to S3`, e));
}

export async function sync(): Promise<void> {
  const s3 = getTracedAWSV3Client(new S3Client({}));

  const runnerOs = process.env.GITHUB_RUNNER_OS || 'linux';
  const runnerArch = process.env.GITHUB_RUNNER_ARCHITECTURE || 'x64';

  const cacheObject: CacheObject = {
    bucket: process.env.S3_BUCKET_NAME as string,
    key: process.env.S3_OBJECT_KEY as string,
  };
  if (!cacheObject.bucket || !cacheObject.key) {
    throw Error('Please check all mandatory variables are set.');
  }
  const actionRunnerReleaseAsset = await getReleaseAsset(runnerOs, runnerArch);
  if (actionRunnerReleaseAsset === undefined) {
    throw Error('Cannot find GitHub release asset.');
  }

  const currentVersion = await getCachedVersion(s3, cacheObject);
  logger.debug('latest: ' + currentVersion);
  if (currentVersion === undefined || currentVersion != actionRunnerReleaseAsset.name) {
    await uploadToS3(s3, cacheObject, actionRunnerReleaseAsset);
  } else {
    logger.debug('Distribution is up-to-date, download skipped.');
  }
}

import { Octokit } from '@octokit/rest';
import { PassThrough } from 'stream';
import { S3 } from 'aws-sdk';
import AWS from 'aws-sdk';
import axios from 'axios';
import { logger as rootLogger } from './logger';

const logger = rootLogger.getChildLogger();

const versionKey = 'name';

interface CacheObject {
  bucket: string;
  key: string;
}

async function getCachedVersion(s3: S3, cacheObject: CacheObject): Promise<string | undefined> {
  try {
    const objectTagging = await s3
      .getObjectTagging({
        Bucket: cacheObject.bucket,
        Key: cacheObject.key,
      })
      .promise();
    const versions = objectTagging.TagSet?.filter((t: S3.Tag) => t.Key === versionKey);
    return versions.length === 1 ? versions[0].Value : undefined;
  } catch (e) {
    logger.debug('No tags found');
    return undefined;
  }
}
interface ReleaseAsset {
  name: string;
  downloadUrl: string;
}

async function getLinuxReleaseAsset(
  runnerArch = 'x64',
  fetchPrereleaseBinaries = false,
): Promise<ReleaseAsset | undefined> {
  const githubClient = new Octokit();
  const assetsList = await githubClient.repos.listReleases({
    owner: 'actions',
    repo: 'runner',
  });
  if (assetsList.data?.length === 0) {
    return undefined;
  }

  const latestPrereleaseIndex = assetsList.data.findIndex((a) => a.prerelease === true);
  const latestReleaseIndex = assetsList.data.findIndex((a) => a.prerelease === false);

  let asset = undefined;
  if (fetchPrereleaseBinaries && latestPrereleaseIndex != -1 && latestPrereleaseIndex < latestReleaseIndex) {
    asset = assetsList.data[latestPrereleaseIndex];
  } else if (latestReleaseIndex != -1) {
    asset = assetsList.data[latestReleaseIndex];
  } else {
    return undefined;
  }
  const linuxAssets = asset.assets?.filter((a) => a.name?.includes(`actions-runner-linux-${runnerArch}-`));

  return linuxAssets?.length === 1
    ? { name: linuxAssets[0].name, downloadUrl: linuxAssets[0].browser_download_url }
    : undefined;
}

async function uploadToS3(s3: S3, cacheObject: CacheObject, actionRunnerReleaseAsset: ReleaseAsset): Promise<void> {
  const writeStream = new PassThrough();
  const writePromise = s3
    .upload({
      Bucket: cacheObject.bucket,
      Key: cacheObject.key,
      Tagging: versionKey + '=' + actionRunnerReleaseAsset.name,
      Body: writeStream,
    })
    .promise();

  logger.debug('Start downloading %s and uploading to S3.', actionRunnerReleaseAsset.name);

  const readPromise = new Promise<void>((resolve, reject) => {
    axios
      .request<NodeJS.ReadableStream>({
        method: 'get',
        url: actionRunnerReleaseAsset.downloadUrl,
        responseType: 'stream',
      })
      .then((res) => {
        res.data
          .pipe(writeStream)

          .on('finish', () => resolve())
          .on('error', (error) => reject(error));
      })
      .catch((error) => reject(error));
  });

  await Promise.all([readPromise, writePromise])
    .then(() => logger.info(`The new distribution is uploaded to S3.`))
    .catch((error) => {
      logger.error(`Uploading of the new distribution to S3 failed: ${error}`);
      throw error;
    });
}

export const handle = async (): Promise<void> => {
  const s3 = new AWS.S3();

  const runnerArch = process.env.GITHUB_RUNNER_ARCHITECTURE || 'x64';
  const fetchPrereleaseBinaries = JSON.parse(process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES || 'false');

  const cacheObject: CacheObject = {
    bucket: process.env.S3_BUCKET_NAME as string,
    key: process.env.S3_OBJECT_KEY as string,
  };
  if (!cacheObject.bucket || !cacheObject.key) {
    throw Error('Please check all mandatory variables are set.');
  }

  const actionRunnerReleaseAsset = await getLinuxReleaseAsset(runnerArch, fetchPrereleaseBinaries);
  if (actionRunnerReleaseAsset === undefined) {
    throw Error('Cannot find GitHub release asset.');
  }

  const currentVersion = await getCachedVersion(s3, cacheObject);
  logger.debug('latest: ' + currentVersion);
  if (currentVersion === undefined || currentVersion != actionRunnerReleaseAsset.name) {
    uploadToS3(s3, cacheObject, actionRunnerReleaseAsset);
  } else {
    logger.debug('Distribution is up-to-date, no action.');
  }
};

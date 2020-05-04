import { Octokit } from '@octokit/rest';
import { PassThrough } from 'stream';
import request from 'request';
import { S3 } from 'aws-sdk';
import AWS from 'aws-sdk';

AWS.config.update({
  region: process.env.AWS_REGION,
});
const s3 = new S3();

const versionKey = 'name';
const bucketName = process.env.S3_BUCKET_NAME as string;
const bucketObjectKey = process.env.S3_OBJECT_KEY as string;
if (!bucketName || !bucketObjectKey) {
  throw new Error('Please check all mandatory variables are set.');
}

async function getCachedVersion(): Promise<string | undefined> {
  try {
    const objectTagging = await s3
      .getObjectTagging({
        Bucket: bucketName,
        Key: bucketObjectKey,
      })
      .promise();
    const versions = objectTagging.TagSet?.filter((t: S3.Tag) => t.Key === versionKey);
    return versions.length === 1 ? versions[0].Value : undefined;
  } catch (e) {
    console.debug('No tags found');
    return undefined;
  }
}

interface ReleaseAsset {
  name: string;
  downloadUrl: string;
}

async function getLinuxReleaseAsset(): Promise<ReleaseAsset | undefined> {
  const githubClient = new Octokit();
  const linuxAssets = (
    await githubClient.repos.getLatestRelease({
      owner: 'actions',
      repo: 'runner',
    })
  ).data.assets.filter((a) => a.name?.includes('actions-runner-linux-x64-'));
  return linuxAssets?.length === 1
    ? { name: linuxAssets[0].name, downloadUrl: linuxAssets[0].browser_download_url }
    : undefined;
}

async function uploadToS3(actionRunnerReleaseAsset: ReleaseAsset): Promise<void> {
  const writeStream = new PassThrough();
  s3.upload({
    Bucket: bucketName,
    Key: bucketObjectKey,
    Tagging: versionKey + '=' + actionRunnerReleaseAsset.name,
    Body: writeStream,
  }).promise();

  await new Promise((resolve, reject) => {
    console.debug('Start downloading %s and uploading to S3.', actionRunnerReleaseAsset.name);
    request
      .get(actionRunnerReleaseAsset.downloadUrl)
      .pipe(writeStream)
      .on('finish', () => {
        console.info(`The new distribution is uploaded to S3.`);
        resolve();
      })
      .on('error', (error) => {
        reject(error);
      });
  }).catch((error) => {
    console.error(`Exception: ${error}`);
  });
}

export const handle = async (): Promise<void> => {
  const actionRunnerReleaseAsset = await getLinuxReleaseAsset();
  if (actionRunnerReleaseAsset === undefined) {
    throw Error('Cannot find github release asset.');
  }

  const currentVersion = await getCachedVersion();
  console.log('latest: ' + currentVersion);
  if (currentVersion === undefined || currentVersion != actionRunnerReleaseAsset.name) {
    uploadToS3(actionRunnerReleaseAsset);
  } else {
    console.debug('Distribution is up-to-date, no action.');
  }
};

import { Octokit } from '@octokit/rest';
import { PassThrough } from 'stream';
import request from 'request';
import { S3 } from 'aws-sdk';
import AWS from 'aws-sdk';
import yn from 'yn';

const DEFAULTS = {
  method: "GET",
  baseUrl: "https://github-reh.azc.ext.hp.com/api/v3",
 headers: {
    accept: "application/vnd.github.v3+json",
    "user-agent": "octokit/endpoint.js v1.2.3"
  },
  mediaType: {
    format: "",
    previews: []
 }
};


const versionKeyW = 'name';

interface CacheObject {
  bucket: string;
  key: string;
}

async function getCachedVersion(s3: S3, cacheObjectW: CacheObject): Promise<string | undefined> {
  try {
    const objectTaggingW = await s3
      .getObjectTagging({
        Bucket: cacheObjectW.bucket,
        Key: cacheObjectW.key,
      })
      .promise();
    const versionsW = objectTaggingW.TagSet?.filter((t: S3.Tag) => t.Key === versionKeyW);
    return versionsW.length === 1 ? versionsW[0].Value : undefined;
  } catch (e) {
    console.debug('No tags found');
    return undefined;
  }
}
interface ReleaseAsset {
  name: string;
  downloadUrl: string;
}

async function getWindowsReleaseAsset(
  runnerArch = 'x64',
  fetchPrereleaseBinaries = false,
): Promise<ReleaseAsset | undefined> {
  const githubClient = new Octokit();
  const assetsListW = await githubClient.repos.listReleases({
    owner: 'actions',
    repo: 'runner',
  });
  if (assetsListW.data?.length === 0) {
    return undefined;
  }

  const latestPrereleaseIndexW = assetsListW.data.findIndex((a) => a.prerelease === true);
  const latestReleaseIndexW = assetsListW.data.findIndex((a) => a.prerelease === false);

  let asset = undefined;
  if (fetchPrereleaseBinaries && latestPrereleaseIndexW < latestReleaseIndexW) {
    asset = assetsListW.data[latestPrereleaseIndexW];
  } else if (latestReleaseIndexW != -1) {
    asset = assetsListW.data[latestReleaseIndexW];
  } else {
    return undefined;
  }
  const windowsAssets = asset.assets?.filter((a) => a.name?.includes(`actions-runner-win-${runnerArch}-`));

  return windowsAssets?.length === 1
    ? { name: windowsAssets[0].name, downloadUrl: windowsAssets[0].browser_download_url }
    : undefined;
}

async function uploadToS3(s3: S3, cacheObjectW: CacheObject, actionRunnerReleaseAssetW: ReleaseAsset): Promise<void> {
  const writeStreamW = new PassThrough();
  s3.upload({
    Bucket: cacheObjectW.bucket,
    Key: cacheObjectW.key,
    Tagging: versionKeyW + '=' + actionRunnerReleaseAssetW.name,
    Body: writeStreamW,
  }).promise();

  await new Promise<void>((resolve, reject) => {
    console.debug('Start downloading Windows %s and uploading to S3.', actionRunnerReleaseAssetW.name);
    request
      .get(actionRunnerReleaseAssetW.downloadUrl)
      .pipe(writeStreamW)
      .on('finish', () => {
        console.info(`The new Windows distribution is uploaded to S3.`);
        resolve();
      })
      .on('error', (error) => {
        reject(error);
      });
  }).catch((error) => {
    console.error(`Exception: ${error}`);
  });
}

export const handleforwin = async (): Promise<void> => {
  const s3 = new AWS.S3();

  const runnerArch = process.env.GITHUB_RUNNER_ARCHITECTURE || 'x64';
  const fetchPrereleaseBinaries = yn(process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES, { default: false });

  const cacheObjectW: CacheObject = {
    bucket: process.env.S3_BUCKET_NAME as string,
    key: process.env.S3_OBJECT_KEY_windows as string,
  };
  if (!cacheObjectW.bucket || !cacheObjectW.key) {
    throw Error('Please check all mandatory variables are set.');
  }

  const actionRunnerReleaseAssetW = await getWindowsReleaseAsset(runnerArch, fetchPrereleaseBinaries);
  if (actionRunnerReleaseAssetW === undefined) {
    throw Error('Cannot find GitHub release asset.');
  }

  const currentVersionW = await getCachedVersion(s3, cacheObjectW);
  console.debug('latest: ' + currentVersionW);
  if (currentVersionW === undefined || currentVersionW != actionRunnerReleaseAssetW.name) {
    uploadToS3(s3, cacheObjectW, actionRunnerReleaseAssetW);
  } else {
    console.debug('Distribution for Windows is up-to-date, no action.');
  }
};

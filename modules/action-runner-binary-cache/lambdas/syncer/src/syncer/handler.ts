import { Octokit } from '@octokit/rest';
import { PassThrough } from 'stream';
import request from 'request';
import { S3 } from 'aws-sdk';
import AWS from 'aws-sdk';

AWS.config.update({
  region: process.env.AWS_REGION,
});
const s3 = new S3();

const uploadStream = ({ Bucket, Key, Tagging }) => {
  const pass = new PassThrough();
  return {
    writeStream: pass,
    promise: s3.upload({ Bucket, Key, Tagging, Body: pass }).promise(),
  };
};

export const handle = async (): Promise<number> => {
  const githubClient = new Octokit();
  const assets = (
    await githubClient.repos.getLatestRelease({
      owner: 'actions',
      repo: 'runner',
    })
  ).data.assets;

  const objectTag = await s3
    .getObjectTagging({
      Bucket: '551dd065-baae-47c7-9c38-7600efd12e9c2',
      Key: 'runner.tgz',
    })
    .promise()
    .catch(() => console.debug('no tags found.'));

  const versions = objectTag?.TagSet?.filter((t) => t.Key === 'updated_at');
  if (versions?.length != 1 || versions[0].Value != assets[0].updated_at) {
    const { writeStream, promise } = uploadStream({
      Bucket: '551dd065-baae-47c7-9c38-7600efd12e9c2',
      Key: 'runner.tgz',
      Tagging: 'updated_at=' + assets[0].updated_at,
    });

    await new Promise((resolve, reject) => {
      console.debug('Start downloading action runner and uploading to S3.');
      let stream = request
        .get(assets[0].browser_download_url)
        .pipe(writeStream)
        .on('finish', () => {
          console.info(`The new distribution is uploaded to s3.`);
          resolve();
        })
        .on('error', (error) => {
          reject(error);
        });
    }).catch((error) => {
      console.error(`Exception: ${error}`);
    });
  } else {
    console.debug('Distribution is up-to-date, no action.');
  }

  return 200;
};

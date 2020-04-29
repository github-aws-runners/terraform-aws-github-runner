import { Octokit } from '@octokit/rest';
import { PassThrough } from 'stream';
import * as request from 'request';
import { S3 } from 'aws-sdk';
import AWS from 'aws-sdk';

AWS.config.update({
  region: process.env.AWS_REGION,
});
const s3 = new S3();

export const handle = async (): Promise<number> => {
  const githubClient = new Octokit();
  const assets = (
    await githubClient.repos.getLatestRelease({
      owner: 'actions',
      repo: 'runner',
    })
  ).data.assets;

  const result = assets.filter((a) => a.name.includes('actions-runner-linux-x64'));

  console.debug(result);

  const uploadStream = ({ Bucket, Key }) => {
    const pass = new PassThrough();
    return {
      writeStream: pass,
      promise: s3.upload({ Bucket, Key, Body: pass }).promise(),
    };
  };

  const { writeStream, promise } = uploadStream({
    Bucket: '551dd065-baae-47c7-9c38-7600efd12e9c2',
    Key: 'runner.tgz',
  });

  await new Promise((resolve, reject) => {
    let stream = request
      .get(result[0].browser_download_url)
      .pipe(writeStream)
      .on('finish', () => {
        console.debug(`The file is uploaded to s3.`);
        resolve();
      })
      .on('error', (error) => {
        reject(error);
      });
  }).catch((error) => {
    console.error(`Exception: ${error}`);
  });
  return 200;
};

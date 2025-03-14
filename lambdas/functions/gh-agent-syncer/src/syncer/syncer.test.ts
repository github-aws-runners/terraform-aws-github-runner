import { GetObjectTaggingCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-vitest';
import axios from 'axios';
import { PassThrough } from 'stream';

import mockDataLatestRelease from '../../test/resources/github-latest-release.json';
import noX64Assets from '../../test/resources/github-releases-no-x64.json';
import { sync } from './syncer';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockOctokit = {
  repos: {
    getLatestRelease: vi.fn(),
  },
};
vi.mock('@octokit/rest', async () => ({
  Octokit: vi.fn().mockImplementation(() => mockOctokit),
}));

// mock stream for Axios
const mockResponse = `{"data": 123}`;
const mockStream = new PassThrough();
mockStream.push(mockResponse);
mockStream.end();

vi.mock('axios', async () => ({
  default: {
    get: vi.fn(),
  },
}));
const mockAxios = axios as vi.Mocked<typeof axios>;
mockAxios.get.mockResolvedValue({
  data: mockStream,
});

process.env.AWS_REGION = 'us-east-1';
const mockS3client = mockClient(S3Client);

const bucketName = 'my-bucket';
const objectExtension: Record<string, string> = {
  linux: '.tar.gz',
  win: '.zip',
};
const bucketObjectNames: Record<string, string> = {
  linux: `actions-runner-linux${objectExtension['linux']}`,
  win: `actions-runner-windows${objectExtension['win']}`,
};

const bucketObjectKey = (os: string) => bucketObjectNames[os];

const runnerOs = [['linux'], ['win']];

const latestRelease = '2.296.2';

beforeEach(() => {
  vi.clearAllMocks();
  mockS3client.reset();
});

vi.setConfig({ testTimeout: 60 * 1000 });

describe('Synchronize action distribution (no S3 tags).', () => {
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = bucketName;
    mockOctokit.repos.getLatestRelease.mockImplementation(() => ({
      data: mockDataLatestRelease,
    }));
  });

  it.each(runnerOs)('%p Distribution is S3 has no tags.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
    mockS3client.on(GetObjectTaggingCommand).resolves({
      TagSet: undefined,
    });

    await sync();
    expect(mockS3client.commandCalls(PutObjectCommand).length).toBe(1);
  });
});

describe('Synchronize action distribution.', () => {
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = bucketName;
    mockS3client.reset();
    mockOctokit.repos.getLatestRelease.mockImplementation(() => ({
      data: mockDataLatestRelease,
    }));
  });

  it.each(runnerOs)('%p Distribution is up-to-date with latest release.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
    mockS3client.on(GetObjectTaggingCommand).resolves({
      TagSet: [{ Key: 'name', Value: `actions-runner-${os}-x64-${latestRelease}${objectExtension[os]}` }],
    });

    await sync();
    expect(mockOctokit.repos.getLatestRelease).toBeCalledTimes(1);
    expect(mockS3client.commandCalls(GetObjectTaggingCommand)[0].args[0].input).toEqual({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
    });

    expect(mockS3client.commandCalls(PutObjectCommand).length).toBe(0);
  });

  it.each(runnerOs)('%p Distribution should update to release.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;

    mockS3client.on(GetObjectTaggingCommand).resolves({
      TagSet: [{ Key: 'name', Value: `actions-runner-${os}-x64-0${objectExtension[os]}` }],
    });

    await sync();
    expect(mockOctokit.repos.getLatestRelease).toBeCalledTimes(1);
    expect(mockS3client.commandCalls(GetObjectTaggingCommand)[0].args[0].input).toEqual({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
    });

    expect(mockS3client.commandCalls(PutObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
      Tagging: `name=actions-runner-${os}-x64-${latestRelease}${objectExtension[os]}`,
    });
  });

  it.each(runnerOs)('%p Distribution should update to release (tags look-up errored)', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;

    mockS3client.on(GetObjectTaggingCommand).rejects(new Error('No tags'));

    await sync();
    expect(mockOctokit.repos.getLatestRelease).toBeCalledTimes(1);
    expect(mockS3client.commandCalls(GetObjectTaggingCommand)[0].args[0].input).toEqual({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
    });

    expect(mockS3client.commandCalls(PutObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
      Tagging: `name=actions-runner-${os}-x64-${latestRelease}${objectExtension[os]}`,
    });
  });

  it.each(runnerOs)('%p Tags, but no version, distribution should update.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
    mockS3client.on(GetObjectTaggingCommand).resolves({
      TagSet: [{ Key: 'someKey', Value: `someValue` }],
    });

    await sync();
    expect(mockOctokit.repos.getLatestRelease).toBeCalledTimes(1);
    expect(mockS3client.commandCalls(GetObjectTaggingCommand)[0].args[0].input).toEqual({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
    });

    expect(mockS3client.commandCalls(PutObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
      Tagging: `name=actions-runner-${os}-x64-${latestRelease}${objectExtension[os]}`,
    });
  });
});

describe('No release assets found.', () => {
  const errorMessage = 'Cannot find GitHub release asset.';
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = bucketName;
    process.env.S3_OBJECT_KEY = bucketObjectKey('linux');
  });

  it('Empty result.', async () => {
    mockOctokit.repos.getLatestRelease.mockImplementation(() => ({
      data: undefined,
    }));

    await expect(sync()).rejects.toThrow(errorMessage);
  });

  it.each(runnerOs)('No %p x64 asset.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
    mockOctokit.repos.getLatestRelease.mockImplementation(() => ({
      data: noX64Assets,
    }));
    await expect(sync()).rejects.toThrow(errorMessage);
  });
});

describe('Invalid config', () => {
  const errorMessage = 'Please check all mandatory variables are set.';
  it('No bucket and object key.', async () => {
    delete process.env.S3_OBJECT_KEY;
    delete process.env.S3_BUCKET_NAME;
    await expect(sync()).rejects.toThrow(errorMessage);
  });

  it('No bucket.', async () => {
    delete process.env.S3_BUCKET_NAME;
    process.env.S3_OBJECT_KEY = bucketObjectKey('linux');
    await expect(sync()).rejects.toThrow(errorMessage);
  });

  it('No object key.', async () => {
    delete process.env.S3_OBJECT_KEY;
    process.env.S3_BUCKET_NAME = bucketName;
    await expect(sync()).rejects.toThrow(errorMessage);
  });
});

import { sync } from './syncer';
import listReleases from '../../test/resources/github-list-releases.json';
import listReleasesEmpty from '../../test/resources/github-list-releases-empty-assets.json';
import listReleasesNoLinux from '../../test/resources/github-list-releases-no-linux.json';
import listReleasesNoArm64 from '../../test/resources/github-list-releases-no-arm64.json';
import { S3 } from 'aws-sdk';
import axios from 'axios';
import { request } from 'http';
import { EventEmitter, PassThrough, Readable } from 'stream';

const mockOctokit = {
  repos: {
    listReleases: jest.fn(),
  },
};
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

// mock stream for Axios
const mockResponse = `{"data": 123}`;
const mockStream = new PassThrough();
mockStream.push(mockResponse);
mockStream.end();

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;
mockedAxios.request.mockResolvedValue({
  data: mockStream,
});

const mockS3 = {
  getObjectTagging: jest.fn(),
  upload: jest.fn().mockImplementation(() => {
    return { promise: jest.fn(() => Promise.resolve()) };
  }),
};
jest.mock('aws-sdk', () => ({
  S3: jest.fn().mockImplementation(() => mockS3),
}));

const bucketName = 'my-bucket';
const bucketObjectKey = 'actions-runner-linux.tar.gz';
beforeEach(() => {
  jest.clearAllMocks();
});

jest.setTimeout(60 * 1000);

describe('Synchronize action distribution.', () => {
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = bucketName;
    process.env.S3_OBJECT_KEY = bucketObjectKey;
    process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES = 'false';

    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: listReleases,
    }));
  });

  it('Distribution is up-to-date with latest release.', async () => {
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({ TagSet: [{ Key: 'name', Value: 'actions-runner-linux-x64-2.285.1.tar.gz' }] });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey,
    });
    expect(mockS3.upload).toBeCalledTimes(0);
  });

  it('Distribution is up-to-date with latest release when there are no prereleases.', async () => {
    process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES = 'true';
    const releases = listReleases.slice(1);

    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: releases,
    }));
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({ TagSet: [{ Key: 'name', Value: 'actions-runner-linux-x64-2.285.1.tar.gz' }] });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey,
    });
    expect(mockS3.upload).toBeCalledTimes(0);
  });

  it('Distribution is up-to-date with latest prerelease.', async () => {
    process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES = 'true';
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({ TagSet: [{ Key: 'name', Value: 'actions-runner-linux-x64-2.286.0.tar.gz' }] });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey,
    });
    expect(mockS3.upload).toBeCalledTimes(0);
  });

  it('Distribution should update to release.', async () => {
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({ TagSet: [{ Key: 'name', Value: 'actions-runner-linux-x64-0.tar.gz' }] });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey,
    });
    expect(mockS3.upload).toBeCalledTimes(1);
    const s3JsonBody = mockS3.upload.mock.calls[0][0];
    expect(s3JsonBody['Tagging']).toEqual('name=actions-runner-linux-x64-2.285.1.tar.gz');
  });

  it('Distribution should update to release if there are no pre-releases.', async () => {
    process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES = 'true';
    const releases = listReleases.slice(1);

    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: releases,
    }));
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({ TagSet: [{ Key: 'name', Value: 'actions-runner-linux-x64-0.tar.gz' }] });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey,
    });
    expect(mockS3.upload).toBeCalledTimes(1);
    const s3JsonBody = mockS3.upload.mock.calls[0][0];
    expect(s3JsonBody['Tagging']).toEqual('name=actions-runner-linux-x64-2.285.1.tar.gz');
  });

  it('Distribution should update to prerelease.', async () => {
    process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES = 'true';
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({ TagSet: [{ Key: 'name', Value: 'actions-runner-linux-x64-0.tar.gz' }] });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey,
    });
    expect(mockS3.upload).toBeCalledTimes(1);
    const s3JsonBody = mockS3.upload.mock.calls[0][0];
    expect(s3JsonBody['Tagging']).toEqual('name=actions-runner-linux-x64-2.286.0.tar.gz');
  });

  it('Distribution should not update to prerelease if there is a newer release.', async () => {
    process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES = 'true';
    const releases = listReleases;
    releases[0].prerelease = false;
    releases[1].prerelease = true;

    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: releases,
    }));
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({ TagSet: [{ Key: 'name', Value: 'actions-runner-linux-x64-0.tar.gz' }] });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey,
    });
    expect(mockS3.upload).toBeCalledTimes(1);
    const s3JsonBody = mockS3.upload.mock.calls[0][0];
    expect(s3JsonBody['Tagging']).toEqual('name=actions-runner-linux-x64-2.286.0.tar.gz');
  });

  it('No tag in S3, distribution should update.', async () => {
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          throw new Error();
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey,
    });
    expect(mockS3.upload).toBeCalledTimes(1);
  });

  it('Tags, but no version, distribution should update.', async () => {
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({ TagSet: [{ Key: 'someKey', Value: 'someValue' }] });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey,
    });
    expect(mockS3.upload).toBeCalledTimes(1);
  });
});

describe('No release assets found.', () => {
  const errorMessage = 'Cannot find GitHub release asset.';
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = bucketName;
    process.env.S3_OBJECT_KEY = bucketObjectKey;
  });

  it('Empty list of assets.', async () => {
    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: listReleasesEmpty,
    }));

    await expect(sync()).rejects.toThrow(errorMessage);
  });

  it('No linux x64 asset.', async () => {
    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: [listReleasesNoLinux],
    }));

    await expect(sync()).rejects.toThrow(errorMessage);
  });

  it('Empty asset list.', async () => {
    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: [],
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
    process.env.S3_OBJECT_KEY = bucketObjectKey;
    await expect(sync()).rejects.toThrow(errorMessage);
  });
  it('No object key.', async () => {
    delete process.env.S3_OBJECT_KEY;
    process.env.S3_BUCKET_NAME = bucketName;
    await expect(sync()).rejects.toThrow(errorMessage);
  });
});

describe('Synchronize action distribution for arm64.', () => {
  const errorMessage = 'Cannot find GitHub release asset.';
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = bucketName;
    process.env.S3_OBJECT_KEY = bucketObjectKey;
    process.env.GITHUB_RUNNER_ARCHITECTURE = 'arm64';
  });

  it('No linux arm64 asset.', async () => {
    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: [listReleasesNoArm64],
    }));

    await expect(sync()).rejects.toThrow(errorMessage);
  });
});

describe('Synchronize action distribution for windows.', () => {
  const errorMessage = 'Cannot find GitHub release asset.';
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = bucketName;
    process.env.S3_OBJECT_KEY = bucketObjectKey;
    process.env.GITHUB_RUNNER_OS = 'win';
  });

  it('No win asset.', async () => {
    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: listReleases.map((release) => ({
        ...release,
        assets: release.assets.filter((asset) => !asset.name.includes('win')),
      })),
    }));

    await expect(sync()).rejects.toThrow(errorMessage);
  });
});

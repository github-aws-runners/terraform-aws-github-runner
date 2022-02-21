import { S3 } from 'aws-sdk';
import axios from 'axios';
import { request } from 'http';
import { EventEmitter, PassThrough, Readable } from 'stream';

import listReleasesEmpty from '../../test/resources/github-list-releases-empty-assets.json';
import listReleasesNoArm64 from '../../test/resources/github-list-releases-no-arm64.json';
import listReleasesNoLinux from '../../test/resources/github-list-releases-no-linux.json';
import listReleases from '../../test/resources/github-list-releases.json';
import { sync } from './syncer';

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

const latestRelease = '2.287.0';
const latestPreRelease = '2.287.1';

beforeEach(() => {
  jest.clearAllMocks();
});

jest.setTimeout(60 * 1000);

describe('Synchronize action distribution.', () => {
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = bucketName;
    process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES = 'false';

    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: listReleases,
    }));
  });

  test.each(runnerOs)('%p Distribution is up-to-date with latest release.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({
            TagSet: [{ Key: 'name', Value: `actions-runner-${os}-x64-${latestRelease}${objectExtension[os]}` }],
          });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
    });
    expect(mockS3.upload).toBeCalledTimes(0);
  });

  test.each(runnerOs)(
    '%p Distribution is up-to-date with latest release when there are no prereleases.',
    async (os) => {
      process.env.S3_OBJECT_KEY = bucketObjectKey(os);
      process.env.GITHUB_RUNNER_OS = os;
      process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES = 'true';
      const releases = listReleases.slice(1);

      mockOctokit.repos.listReleases.mockImplementation(() => ({
        data: releases,
      }));
      mockS3.getObjectTagging.mockImplementation(() => {
        return {
          promise() {
            return Promise.resolve({
              TagSet: [{ Key: 'name', Value: `actions-runner-${os}-x64-${latestRelease}${objectExtension[os]}` }],
            });
          },
        };
      });

      await sync();
      expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
      expect(mockS3.getObjectTagging).toBeCalledWith({
        Bucket: bucketName,
        Key: bucketObjectKey(os),
      });
      expect(mockS3.upload).toBeCalledTimes(0);
    },
  );

  test.each(runnerOs)('%p Distribution is up-to-date with latest prerelease.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
    process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES = 'true';
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({
            TagSet: [{ Key: 'name', Value: `actions-runner-${os}-x64-${latestPreRelease}${objectExtension[os]}` }],
          });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
    });
    expect(mockS3.upload).toBeCalledTimes(0);
  });

  test.each(runnerOs)('%p Distribution should update to release.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({
            TagSet: [{ Key: 'name', Value: `actions-runner-${os}-x64-0${objectExtension[os]}` }],
          });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
    });
    expect(mockS3.upload).toBeCalledTimes(1);
    const s3JsonBody = mockS3.upload.mock.calls[0][0];
    expect(s3JsonBody['Tagging']).toEqual(`name=actions-runner-${os}-x64-${latestRelease}${objectExtension[os]}`);
  });

  test.each(runnerOs)('%p Distribution should update to release if there are no pre-releases.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
    process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES = 'true';
    const releases = listReleases.slice(1);

    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: releases,
    }));
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({
            TagSet: [{ Key: 'name', Value: `actions-runner-${os}-x64-0${objectExtension[os]}` }],
          });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
    });
    expect(mockS3.upload).toBeCalledTimes(1);
    const s3JsonBody = mockS3.upload.mock.calls[0][0];
    expect(s3JsonBody['Tagging']).toEqual(`name=actions-runner-${os}-x64-${latestRelease}${objectExtension[os]}`);
  });

  test.each(runnerOs)('%p Distribution should update to prerelease.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
    process.env.GITHUB_RUNNER_ALLOW_PRERELEASE_BINARIES = 'true';
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({
            TagSet: [{ Key: 'name', Value: `actions-runner-${os}-x64-0${objectExtension[os]}` }],
          });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
    });
    expect(mockS3.upload).toBeCalledTimes(1);
    const s3JsonBody = mockS3.upload.mock.calls[0][0];
    expect(s3JsonBody['Tagging']).toEqual(`name=actions-runner-${os}-x64-${latestPreRelease}${objectExtension[os]}`);
  });

  test.each(runnerOs)('%p Distribution should not update to prerelease if there is a newer release.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
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
          return Promise.resolve({
            TagSet: [{ Key: 'name', Value: `actions-runner-${os}-x64-0${objectExtension[os]}` }],
          });
        },
      };
    });

    await sync();
    expect(mockOctokit.repos.listReleases).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey(os),
    });
    expect(mockS3.upload).toBeCalledTimes(1);
    const s3JsonBody = mockS3.upload.mock.calls[0][0];
    expect(s3JsonBody['Tagging']).toEqual(`name=actions-runner-${os}-x64-${latestPreRelease}${objectExtension[os]}`);
  });

  test.each(runnerOs)('%p No tag in S3, distribution should update.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
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
      Key: bucketObjectKey(os),
    });
    expect(mockS3.upload).toBeCalledTimes(1);
  });

  test.each(runnerOs)('%p Tags, but no version, distribution should update.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
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
      Key: bucketObjectKey(os),
    });
    expect(mockS3.upload).toBeCalledTimes(1);
  });
});

describe('No release assets found.', () => {
  const errorMessage = 'Cannot find GitHub release asset.';
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = bucketName;
    process.env.S3_OBJECT_KEY = bucketObjectKey('linux');
  });

  it('Empty list of assets.', async () => {
    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: listReleasesEmpty,
    }));

    await expect(sync()).rejects.toThrow(errorMessage);
  });

  test.each(runnerOs)('No %p x64 asset.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
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
    process.env.S3_OBJECT_KEY = bucketObjectKey('linux');
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
    process.env.GITHUB_RUNNER_ARCHITECTURE = 'arm64';
  });

  test.each(runnerOs)('No %p arm64 asset.', async (os) => {
    process.env.S3_OBJECT_KEY = bucketObjectKey(os);
    process.env.GITHUB_RUNNER_OS = os;
    mockOctokit.repos.listReleases.mockImplementation(() => ({
      data: [listReleasesNoArm64],
    }));

    await expect(sync()).rejects.toThrow(errorMessage);
  });
});

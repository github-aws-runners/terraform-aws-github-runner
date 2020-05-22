import { handle } from './handler';
import latestReleases from '../../test/resources/github-latest-releases.json';
import latestReleasesEmpty from '../../test/resources/github-latest-releases-empty.json';
import latestReleasesNoLinux from '../../test/resources/github-latest-releases-no-linux.json';

const mockOctokit = {
  repos: {
    getLatestRelease: jest.fn(),
  },
};
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn().mockImplementation(() => mockOctokit),
}));

const mockS3 = {
  getObjectTagging: jest.fn(),
  upload: jest.fn(),
};
jest.mock('aws-sdk', () => ({
  S3: jest.fn().mockImplementation(() => mockS3),
}));

const bucketName = 'my-bucket';
const bucketObjectKey = 'actions-runner-linux.tar.gz';
beforeEach(() => {
  jest.clearAllMocks();
});

describe('Synchronize action distribution.', () => {
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = bucketName;
    process.env.S3_OBJECT_KEY = bucketObjectKey;

    mockOctokit.repos.getLatestRelease.mockImplementation(() => ({
      data: latestReleases.data,
    }));
  });

  it('Distribution is up-to-date.', async () => {
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({ TagSet: [{ Key: 'name', Value: 'actions-runner-linux-x64-2.262.1.tar.gz' }] });
        },
      };
    });

    await handle();
    expect(mockOctokit.repos.getLatestRelease).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey,
    });
    expect(mockS3.upload).toBeCalledTimes(0);
  });

  it('Distribution should update.', async () => {
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          return Promise.resolve({ TagSet: [{ Key: 'name', Value: 'actions-runner-linux-x64-0.tar.gz' }] });
        },
      };
    });

    await handle();
    expect(mockOctokit.repos.getLatestRelease).toBeCalledTimes(1);
    expect(mockS3.getObjectTagging).toBeCalledWith({
      Bucket: bucketName,
      Key: bucketObjectKey,
    });
    expect(mockS3.upload).toBeCalledTimes(1);
  });

  it('No tag in S3, distribution should update.', async () => {
    mockS3.getObjectTagging.mockImplementation(() => {
      return {
        promise() {
          throw new Error();
        },
      };
    });

    await handle();
    expect(mockOctokit.repos.getLatestRelease).toBeCalledTimes(1);
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

    await handle();
    expect(mockOctokit.repos.getLatestRelease).toBeCalledTimes(1);
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
    mockOctokit.repos.getLatestRelease.mockImplementation(() => ({
      data: latestReleasesEmpty.data,
    }));

    await expect(handle()).rejects.toThrow(errorMessage);
  });

  it('No linux x64 asset.', async () => {
    mockOctokit.repos.getLatestRelease.mockImplementation(() => ({
      data: latestReleasesNoLinux.data,
    }));

    await expect(handle()).rejects.toThrow(errorMessage);
  });
});

describe('Invalid config', () => {
  const errorMessage = 'Please check all mandatory variables are set.';
  it('No bucket and object key.', async () => {
    delete process.env.S3_OBJECT_KEY;
    delete process.env.S3_BUCKET_NAME;
    await expect(handle()).rejects.toThrow(errorMessage);
  });
  it('No bucket.', async () => {
    delete process.env.S3_BUCKET_NAME;
    process.env.S3_OBJECT_KEY = bucketObjectKey;
    await expect(handle()).rejects.toThrow(errorMessage);
  });
  it('No object key.', async () => {
    delete process.env.S3_OBJECT_KEY;
    process.env.S3_BUCKET_NAME = bucketName;
    await expect(handle()).rejects.toThrow(errorMessage);
  });
});

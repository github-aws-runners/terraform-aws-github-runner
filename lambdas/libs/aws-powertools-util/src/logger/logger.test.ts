import { Context } from 'aws-lambda';
import * as fs from 'fs';
import * as path from 'path';

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetAllMocks();
});

const context: Context = {
  awsRequestId: '1',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'unit-test',
  functionVersion: '',
  getRemainingTimeInMillis: () => 0,
  invokedFunctionArn: '',
  logGroupName: '',
  logStreamName: '',
  memoryLimitInMB: '',
  done: () => {
    return;
  },
  fail: () => {
    return;
  },
  succeed: () => {
    return;
  },
};

const versionFilePath = path.resolve(__dirname, 'version.json');

let logger: typeof import('../').logger;
let setContext: typeof import('../').setContext;

beforeEach(async () => {
  // Clear the module cache and reload the logger module
  vi.resetModules();
  const loggerModule = await import('../');
  logger = loggerModule.logger;
  setContext = loggerModule.setContext;

  // Ensure a clean state before each test
  if (fs.existsSync(versionFilePath)) {
    fs.unlinkSync(versionFilePath);
  }
});

afterEach(() => {
  // Clean up after each test
  if (fs.existsSync(versionFilePath)) {
    fs.unlinkSync(versionFilePath);
  }
});

describe('A root logger.', () => {
  test('Should log set context.', async () => {
    setContext(context, 'unit-test');

    expect(logger.getPersistentLogAttributes()).toEqual(
      expect.objectContaining({
        'aws-request-id': context.awsRequestId,
        'function-name': context.functionName,
        module: 'unit-test',
      }),
    );
  });
});

describe('Logger version handling', () => {
  test('Should not fail if package.json does not exist', () => {
    const packageFilePath = path.resolve(__dirname, 'package.json');

    // Temporarily rename package.json to simulate its absence
    const tempFilePath = `${packageFilePath}.bak`;
    if (fs.existsSync(packageFilePath)) {
      fs.renameSync(packageFilePath, tempFilePath);
    }

    setContext(context, 'unit-test');

    expect(logger.getPersistentLogAttributes()).toEqual(
      expect.objectContaining({
        version: 'unknown',
      }),
    );

    // Restore package.json
    if (fs.existsSync(tempFilePath)) {
      fs.renameSync(tempFilePath, packageFilePath);
    }
  });

  test('Should log version from package.json', () => {
    const packageFilePath = path.resolve(__dirname, 'package.json');

    // Create a mock package.json file
    const originalPackageData = fs.existsSync(packageFilePath) ? fs.readFileSync(packageFilePath, 'utf-8') : null;
    const mockPackageData = JSON.stringify({ version: '1.0.0' });
    fs.writeFileSync(packageFilePath, mockPackageData);

    setContext(context, 'unit-test');

    expect(logger.getPersistentLogAttributes()).toEqual(
      expect.objectContaining({
        version: '1.0.0',
      }),
    );

    // Restore the original package.json file
    if (originalPackageData) {
      fs.writeFileSync(packageFilePath, originalPackageData);
    } else {
      fs.unlinkSync(packageFilePath);
    }
  });
});

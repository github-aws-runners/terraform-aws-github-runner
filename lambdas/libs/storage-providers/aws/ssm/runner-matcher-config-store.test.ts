import { getParameter, getParameters } from '@aws-github-runner/aws-ssm-util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAwsSsmRunnerMatcherConfigStore } from './runner-matcher-config-store';

vi.mock('@aws-github-runner/aws-ssm-util', () => ({
  getParameter: vi.fn(),
  getParameters: vi.fn(),
}));

const getParameterMock = vi.mocked(getParameter);
const getParametersMock = vi.mocked(getParameters);
const cleanEnv = process.env;

describe('aws_ssm runner matcher config store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...cleanEnv };
    delete process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH;
  });

  it('loads a single matcher config parameter', async () => {
    process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH = '/runner/matcher/config';
    getParameterMock.mockResolvedValue('[{"id":"runner"}]');

    await expect(createAwsSsmRunnerMatcherConfigStore().get()).resolves.toBe('[{"id":"runner"}]');

    expect(getParameterMock).toHaveBeenCalledWith('/runner/matcher/config');
    expect(getParametersMock).not.toHaveBeenCalled();
  });

  it('loads and concatenates matcher config chunks in configured order', async () => {
    process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH = ' /runner/matcher/1 : : /runner/matcher/2 ';
    getParametersMock.mockResolvedValue(
      new Map([
        ['/runner/matcher/2', ',{"id":"runner-2"}]'],
        ['/runner/matcher/1', '[{"id":"runner-1"}'],
      ]),
    );

    await expect(createAwsSsmRunnerMatcherConfigStore().get()).resolves.toBe('[{"id":"runner-1"},{"id":"runner-2"}]');

    expect(getParametersMock).toHaveBeenCalledWith(['/runner/matcher/1', '/runner/matcher/2']);
    expect(getParameterMock).not.toHaveBeenCalled();
  });

  it('rejects a missing matcher config chunk', async () => {
    process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH = '/runner/matcher/1:/runner/matcher/2';
    getParametersMock.mockResolvedValue(new Map([['/runner/matcher/1', '[{"id":"runner-1"}']]));

    await expect(createAwsSsmRunnerMatcherConfigStore().get()).rejects.toThrow(
      'Failed to load parameter for matcherConfig from path /runner/matcher/2: Parameter not found',
    );
  });

  it('rejects malformed combined matcher config', async () => {
    process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH = '/runner/matcher/1:/runner/matcher/2';
    getParametersMock.mockResolvedValue(
      new Map([
        ['/runner/matcher/1', '[{"id":"runner-1"}'],
        ['/runner/matcher/2', ',{"id":"runner-2"}'],
      ]),
    );

    await expect(createAwsSsmRunnerMatcherConfigStore().get()).rejects.toThrow(
      "Failed to load/parse combined matcher config: Expected ',' or ']' after array element",
    );
  });

  it('propagates a single parameter read failure', async () => {
    process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH = '/runner/matcher/config';
    const error = new Error('read failed');
    getParameterMock.mockRejectedValue(error);

    await expect(createAwsSsmRunnerMatcherConfigStore().get()).rejects.toThrow(
      'Failed to load parameter for matcherConfig from path /runner/matcher/config: read failed',
    );
  });

  it('propagates a batch parameter read failure', async () => {
    process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH = '/runner/matcher/1:/runner/matcher/2';
    const error = new Error('read failed');
    getParametersMock.mockRejectedValue(error);

    await expect(createAwsSsmRunnerMatcherConfigStore().get()).rejects.toThrow(
      'Failed to load/parse combined matcher config: read failed',
    );
  });

  it.each([undefined, '', '   '])('requires matcher config parameter paths for input %j', (parameterPaths) => {
    if (parameterPaths === undefined) {
      delete process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH;
    } else {
      process.env.PARAMETER_RUNNER_MATCHER_CONFIG_PATH = parameterPaths;
    }

    expect(() => createAwsSsmRunnerMatcherConfigStore()).toThrow(
      'Environment variable PARAMETER_RUNNER_MATCHER_CONFIG_PATH is not set',
    );
    expect(getParameterMock).not.toHaveBeenCalled();
    expect(getParametersMock).not.toHaveBeenCalled();
  });
});

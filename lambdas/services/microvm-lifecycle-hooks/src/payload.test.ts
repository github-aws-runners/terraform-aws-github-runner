import { HookRequestError, parseRunRequest } from './payload';

const MICROVM_ID = 'microvm-bdd2d536-3d87-35e4-8b40-18664608ebc1';
const SSM_STORAGE = {
  RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
  SSM_TOKEN_PATH: '/github-action-runners/tenant/token',
} as const;
function request(
  payload: object = {
    runnerConfigSsmPath: '/github-action-runners/tenant/token',
    version: 1,
  },
  microvmId = MICROVM_ID,
): string {
  return JSON.stringify({
    microvmId,
    runHookPayload: JSON.stringify(payload),
  });
}

describe('parseRunRequest', () => {
  it('maps the strict version 1 payload to the allowlisted SSM storage environment', () => {
    expect(parseRunRequest(request())).toEqual({
      microvmId: MICROVM_ID,
      storage: SSM_STORAGE,
    });
  });

  it('preserves version 1 trailing-slash normalization', () => {
    expect(
      parseRunRequest(
        request({
          runnerConfigSsmPath: '/github-action-runners/tenant/token/',
          version: 1,
        }),
      ).storage,
    ).toEqual({
      RUNNER_CONFIG_STORAGE_PROVIDER: 'aws_ssm',
      SSM_TOKEN_PATH: '/github-action-runners/tenant/token',
    });
  });

  it.each([SSM_STORAGE])('accepts a strict version 2 $RUNNER_CONFIG_STORAGE_PROVIDER storage context', (storage) => {
    expect(
      parseRunRequest(
        request({
          context: { storage },
          version: 2,
        }),
      ),
    ).toEqual({ microvmId: MICROVM_ID, storage });
  });

  it('accepts opaque path-safe MicroVM identifiers up to 256 characters', () => {
    expect(parseRunRequest(request(undefined, 'a'.repeat(256))).microvmId).toHaveLength(256);
    expect(parseRunRequest(request(undefined, 'future_id.example-01')).microvmId).toBe('future_id.example-01');
  });

  it.each([
    ['invalid outer JSON', '{'],
    ['an invalid MicroVM identifier', request(undefined, '../vm')],
    ['an overlong MicroVM identifier', request(undefined, 'a'.repeat(257))],
    ['an unversioned payload', request({ runnerConfigSsmPath: '/runner/token' })],
    ['a relative legacy SSM path', request({ runnerConfigSsmPath: 'runner/token', version: 1 })],
    ['a root legacy SSM path', request({ runnerConfigSsmPath: '/', version: 1 })],
    ['repeated legacy SSM slashes', request({ runnerConfigSsmPath: '/runner//token', version: 1 })],
    ['legacy SSM traversal', request({ runnerConfigSsmPath: '/runner/../token', version: 1 })],
    [
      'extra version 1 fields',
      request({ encodedJitConfig: 'not-a-real-secret', runnerConfigSsmPath: '/runner/token', version: 1 }),
    ],
    [
      'missing version 1 fields',
      request({ context: { storage: SSM_STORAGE }, runnerConfigSsmPath: '/runner/token', version: 1 }),
    ],
    ['missing version 2 context', request({ version: 2 })],
    ['missing version 2 storage', request({ context: {}, version: 2 })],
    ['extra version 2 fields', request({ context: { storage: SSM_STORAGE }, unexpected: true, version: 2 })],
    ['extra version 2 context fields', request({ context: { storage: SSM_STORAGE, unexpected: true }, version: 2 })],
    [
      'an unknown storage provider',
      request({
        context: {
          storage: { RUNNER_CONFIG_STORAGE_PROVIDER: 'unknown', SSM_TOKEN_PATH: '/runner/token' },
        },
        version: 2,
      }),
    ],
    [
      'provider-incompatible storage fields',
      request({
        context: {
          storage: {
            ...SSM_STORAGE,
            RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME: 'runner-config',
          },
        },
        version: 2,
      }),
    ],
    [
      'typed provider fields in the environment map',
      request({ context: { storage: { provider: 'aws_ssm', tokenPath: '/runner/token' } }, version: 2 }),
    ],
    [
      'AWS credential injection',
      request({ context: { storage: { ...SSM_STORAGE, AWS_ACCESS_KEY_ID: 'not-a-real-key' } }, version: 2 }),
    ],
    [
      'timeout override injection',
      request({ context: { storage: { ...SSM_STORAGE, RUNNER_CONFIG_TIMEOUT_SECONDS: '60' } }, version: 2 }),
    ],
  ])('rejects %s', (_name, body) => {
    expect(() => parseRunRequest(body)).toThrow(HookRequestError);
  });
});

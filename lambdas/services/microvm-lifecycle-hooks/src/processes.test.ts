import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RunnerEntrypointLauncher } from './processes';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('RunnerEntrypointLauncher', () => {
  it('passes the MicroVM id and one-time JIT only through stdin', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'microvm-entrypoint-'));
    const entrypoint = join(directory, 'entrypoint.sh');
    const output = join(directory, 'output');
    const environmentOutput = join(directory, 'environment-output');

    await writeFile(
      entrypoint,
      `#!/bin/sh
set -eu
case "$1" in
  run)
    cat > "$TEST_ENTRYPOINT_OUTPUT"
    printf '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s' \
      "\${ENCODED_JIT_CONFIG-unset}" \
      "\${AWS_ACCESS_KEY_ID-unset}" \
      "\${AWS_SESSION_TOKEN-unset}" \
      "\${AWS_CONTAINER_CREDENTIALS_FULL_URI-unset}" \
      "\${AWS_PROFILE-unset}" \
      "\${AWS_DEFAULT_PROFILE-unset}" \
      "\${AWS_CONFIG_FILE-unset}" \
      "\${AWS_SHARED_CREDENTIALS_FILE-unset}" \
      "\${AWS_CREDENTIAL_EXPIRATION-unset}" \
      "\${RUNNER_CONFIG_STORAGE_PROVIDER-unset}" \
      "\${SSM_TOKEN_PATH-unset}" \
      "\${RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME-unset}" \
      "\${RUNNER_ALLOW_RUNASROOT-unset}" > "$TEST_ENTRYPOINT_ENV_OUTPUT"
    printf 'ready\n' >&3
    ;;
  *) exit 2 ;;
esac
`,
      { mode: 0o700 },
    );

    vi.stubEnv('RUNNER_ENTRYPOINT', entrypoint);
    vi.stubEnv('TEST_ENTRYPOINT_OUTPUT', output);
    vi.stubEnv('TEST_ENTRYPOINT_ENV_OUTPUT', environmentOutput);
    vi.stubEnv('ENCODED_JIT_CONFIG', 'test-value');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-value');
    vi.stubEnv('AWS_SESSION_TOKEN', 'test-value');
    vi.stubEnv('AWS_CONTAINER_CREDENTIALS_FULL_URI', 'http://127.0.0.1/credentials');
    vi.stubEnv('AWS_PROFILE', 'test-profile');
    vi.stubEnv('AWS_DEFAULT_PROFILE', 'test-profile');
    vi.stubEnv('AWS_CONFIG_FILE', '/tmp/test-config');
    vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', '/tmp/test-credentials');
    vi.stubEnv('AWS_CREDENTIAL_EXPIRATION', '2099-01-01T00:00:00Z');
    vi.stubEnv('RUNNER_CONFIG_STORAGE_PROVIDER', 'aws_dynamodb');
    vi.stubEnv('SSM_TOKEN_PATH', '/runner/token');
    vi.stubEnv('RUNNER_CONFIG_DYNAMODB_RUNNER_STATE_TABLE_NAME', 'runner-config');
    vi.stubEnv('RUNNER_ALLOW_RUNASROOT', '1');
    try {
      const processHandle = new RunnerEntrypointLauncher().launch({ jitConfig: 'encoded-jit' }, 'mvm-1234');

      await processHandle.ready;
      await expect(processHandle.exit).resolves.toBe(0);
      expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({
        jitConfig: 'encoded-jit',
        microvmId: 'mvm-1234',
        version: 1,
      });
      expect(await readFile(environmentOutput, 'utf8')).toBe(
        'unset|unset|unset|unset|unset|unset|unset|unset|unset|unset|unset|unset|unset',
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('requires the entrypoint to signal readiness before it exits', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'microvm-entrypoint-'));
    const entrypoint = join(directory, 'entrypoint.sh');
    await writeFile(
      entrypoint,
      `#!/bin/sh
set -eu
case "$1" in
  run)
    cat >/dev/null
    exit 7
    ;;
  *) exit 2 ;;
esac
`,
      { mode: 0o700 },
    );

    vi.stubEnv('RUNNER_ENTRYPOINT', entrypoint);
    try {
      const processHandle = new RunnerEntrypointLauncher().launch({ jitConfig: 'encoded-jit' }, 'mvm-1234');

      await expect(processHandle.ready).rejects.toThrow('exited before signaling readiness');
      await expect(processHandle.exit).resolves.toBe(7);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

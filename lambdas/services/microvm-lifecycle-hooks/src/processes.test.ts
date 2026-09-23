import { chown, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitHubRunnerLauncher } from './processes';

async function prepareRunnerFixture(directory: string, runner: string): Promise<void> {
  if (process.getuid?.() !== 0) {
    return;
  }

  const uid = Number(process.env.RUNNER_UID ?? 1_000);
  const gid = Number(process.env.RUNNER_GID ?? 1_000);
  await chown(directory, uid, gid);
  await chown(runner, uid, gid);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GitHubRunnerLauncher', () => {
  it('launches run.sh directly with the JIT config and a sanitized environment', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'microvm-runner-'));
    const output = join(directory, 'output');
    const environmentOutput = join(directory, 'environment-output');
    const runner = join(directory, 'run.sh');

    await writeFile(
      runner,
      `#!/bin/sh
set -eu
printf '%s|%s|%s' "$1" "$2" "$MICROVM_ID" > "$TEST_RUNNER_OUTPUT"
printf '%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s' \
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
  "\${RUNNER_ALLOW_RUNASROOT-unset}" > "$TEST_RUNNER_ENV_OUTPUT"
sleep 0.2
`,
      { mode: 0o700 },
    );
    await prepareRunnerFixture(directory, runner);

    vi.stubEnv('RUNNER_ROOT', directory);
    vi.stubEnv('TEST_RUNNER_OUTPUT', output);
    vi.stubEnv('TEST_RUNNER_ENV_OUTPUT', environmentOutput);
    vi.stubEnv('ENCODED_JIT_CONFIG', 'test-value');
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-value');
    vi.stubEnv('AWS_SESSION_TOKEN', 'test-value');
    vi.stubEnv('AWS_CONTAINER_CREDENTIALS_FULL_URI', 'http://127.0.0.1/credentials');
    vi.stubEnv('AWS_PROFILE', 'test-profile');
    vi.stubEnv('AWS_DEFAULT_PROFILE', 'test-profile');
    vi.stubEnv('AWS_CONFIG_FILE', '/tmp/test-config');
    vi.stubEnv('AWS_SHARED_CREDENTIALS_FILE', '/tmp/test-credentials');
    vi.stubEnv('AWS_CREDENTIAL_EXPIRATION', '2099-01-01T00:00:00Z');
    vi.stubEnv('RUNNER_CONFIG_STORAGE_PROVIDER', 'aws_ssm');
    vi.stubEnv('SSM_TOKEN_PATH', '/runner/token');
    vi.stubEnv('RUNNER_ALLOW_RUNASROOT', '1');
    try {
      const processHandle = new GitHubRunnerLauncher(30_000, 10).launch({ jitConfig: 'encoded-jit' }, 'mvm-1234');

      await processHandle.ready;
      await expect(processHandle.exit).resolves.toBe(0);
      expect(await readFile(output, 'utf8')).toBe('--jitconfig|encoded-jit|mvm-1234');
      expect(await readFile(environmentOutput, 'utf8')).toBe(
        'unset|unset|unset|unset|unset|unset|unset|unset|unset|unset|unset|unset',
      );
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it('rejects readiness when run.sh exits before the launch handoff', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'microvm-runner-'));
    const runner = join(directory, 'run.sh');

    await writeFile(runner, '#!/bin/sh\nexit 7\n', { mode: 0o700 });
    await prepareRunnerFixture(directory, runner);
    vi.stubEnv('RUNNER_ROOT', directory);
    try {
      const processHandle = new GitHubRunnerLauncher().launch({ jitConfig: 'encoded-jit' }, 'mvm-1234');

      await expect(processHandle.ready).rejects.toThrow('exited before the launch handoff');
      await expect(processHandle.exit).resolves.toBe(7);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});

import { getRunnerConfigStore } from '@aws-github-runner/storage-providers';

export function run(): void {
  process.env.SSM_CLEANUP_CONFIG = JSON.stringify({
    dryRun: true,
    minimumDaysOld: 3,
    tokenPath: '/ghr/my-env/runners/tokens',
  });

  getRunnerConfigStore()
    .houseKeeper()
    .then()
    .catch((e) => {
      console.log(e);
    });
}

run();

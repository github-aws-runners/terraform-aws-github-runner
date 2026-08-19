import { createAwsSsmRunnerConfigStore } from './runner-config-store';

export function run(): void {
  process.env.SSM_CLEANUP_CONFIG = JSON.stringify({
    dryRun: true,
    minimumDaysOld: 3,
    tokenPath: '/ghr/my-env/runners/tokens',
  });

  createAwsSsmRunnerConfigStore()
    .houseKeeper()
    .then()
    .catch((e) => {
      console.log(e);
    });
}

run();

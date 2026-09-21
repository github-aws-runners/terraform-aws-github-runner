import { cleanSSMTokens } from '@aws-github-runner/storage-providers/aws/ssm/runner-config-housekeeper';

export function run(): void {
  cleanSSMTokens({
    dryRun: true,
    minimumDaysOld: 3,
    tokenPath: '/ghr/my-env/runners/tokens',
  })
    .then()
    .catch((e) => {
      console.log(e);
    });
}

run();

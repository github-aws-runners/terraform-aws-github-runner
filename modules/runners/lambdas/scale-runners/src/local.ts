import { createRunner } from './scale-runners/runners';

createRunner({
  runnerConfig: '--url https://github.com/npalm/self-hosted-cowsay --token abc',
  repoName: 'npalm/self-hosted-cowsay',
  environment: 'default',
}).catch((e) => {
  console.log(e);
});

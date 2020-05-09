import { creatRunner } from './scale-runners/runners';

creatRunner({
  runnerConfig: '--url https://github.com/npalm/self-hosted-cowsay --token abc --label niek',
  repoName: 'npalm/self-hosted-cowsay',
}).catch((e) => {
  console.log(e);
});

import { adjust } from './pool/pool';

export function run(): void {
  adjust({ poolSize: 1, dynamicPoolScalingEnabled: false })
    .then()
    .catch((e) => {
      console.log(e);
    });
}

run();

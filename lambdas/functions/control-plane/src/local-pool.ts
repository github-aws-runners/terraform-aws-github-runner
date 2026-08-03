import { adjust } from './pool/pool';

export function run(): void {
  adjust({ poolSize: 1, type: 'ec2' })
    .then()
    .catch((e) => {
      console.log(e);
    });
}

run();

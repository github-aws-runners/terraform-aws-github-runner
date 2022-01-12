import { adjust } from './simple-pool/simple-pool';

export function run(): void {
  adjust({ simplePoolSize: 1 })
    .then()
    .catch((e) => {
      console.log(e);
    });
}

run();

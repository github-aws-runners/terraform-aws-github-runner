import { configureProxyAwsSdkV2Only } from './lambda';
import { scaleDown } from './scale-runners/scale-down';

export function run(): void {
  configureProxyAwsSdkV2Only();
  scaleDown()
    .then()
    .catch((e) => {
      console.log(e);
    });
}

run();

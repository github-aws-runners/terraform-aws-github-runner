import { scaleDown } from './scale-runners/scale-down';

export function run(): void {
  scaleDown()
    .then()
    .catch((e) => {
      console.log(e);
    });
}

run();

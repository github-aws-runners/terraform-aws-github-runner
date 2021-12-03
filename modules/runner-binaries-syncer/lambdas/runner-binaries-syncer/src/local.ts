import { sync } from './syncer/syncer';

sync()
  .then()
  .catch((e) => {
    console.log(e);
  });

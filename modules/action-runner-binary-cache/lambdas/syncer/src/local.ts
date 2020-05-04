import { handle } from './syncer/handler';

handle()
  .then()
  .catch((e) => {
    console.log(e);
  });

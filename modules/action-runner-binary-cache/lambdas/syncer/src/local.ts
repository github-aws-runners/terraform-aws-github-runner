import { handle } from './syncer/handler';

handle()
  .then((c) => console.log(c))
  .catch((e) => {
    console.log(e);
  });

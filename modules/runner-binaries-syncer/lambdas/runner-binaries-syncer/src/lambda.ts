import { handle } from './syncer/handler';
import { handleforwin } from './syncer/handlerforWin';

// eslint-disable-next-line
module.exports.handler = async (event: any, context: any, callback: any): Promise<any> => {
  await handle();
  await handleforwin();
  return callback();
};

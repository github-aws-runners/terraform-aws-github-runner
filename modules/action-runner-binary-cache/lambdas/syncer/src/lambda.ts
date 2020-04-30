import { handle } from './syncer/handler';

module.exports.handler = async (event: any, context: any, callback: any): Promise<any> => {
  const statusCode = await handle();
  return callback(null, {
    statusCode: statusCode,
  });
};

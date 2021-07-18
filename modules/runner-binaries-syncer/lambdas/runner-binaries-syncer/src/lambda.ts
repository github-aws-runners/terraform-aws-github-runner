import { handle } from './syncer/handler';

// eslint-disable-next-line
export const handler = async (event: any, context: any, callback: any): Promise<void> => {
  try {
    await handle();
    callback(null);
  } catch (e) {
    callback(e);
  }
};

import { scaleUp } from './scale-runners/scale-up';
import { scaleDown } from './scale-runners/scale-down';

module.exports.scaleUp = async (event: any, context: any, callback: any) => {
  try {
    await scaleUp();
    return callback(null);
  } catch (e) {
    console.error(e);
    return callback('Failed to scale up');
  }
};

module.exports.scaleDown = async (event: any, context: any, callback: any) => {
  try {
    scaleDown();
    return callback(null);
  } catch (e) {
    console.error(e);
    return callback('Failed to scale down');
  }
};

import moment from 'moment-timezone';
import { getIdleRunnerCount, ScalingDownConfigList } from './scale-down-config';

const DEFAULT_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_IDLE_COUNT = 1;
const now = moment.tz(new Date(), 'America/Los_Angeles');

function getConfig(cronTabs: string[]): ScalingDownConfigList {
  const result: ScalingDownConfigList = [];
  for (const cron of cronTabs) {
    result.push({
      cron: cron,
      idleCount: DEFAULT_IDLE_COUNT,
      timeZone: DEFAULT_TIMEZONE,
    });
  }
  return result;
}

describe('scaleDownConfig', () => {
  describe('Check runners that should be kept idle based on config.', () => {
    it('One active cron configuration', async () => {
      const scaleDownConfig = getConfig(['* * * * * *']);
      expect(getIdleRunnerCount(scaleDownConfig)).toEqual(DEFAULT_IDLE_COUNT);
    });

    it('No active cron configuration', async () => {
      const scaleDownConfig = getConfig(['* * * * * ' + ((now.day() + 1) % 7)]);
      expect(getIdleRunnerCount(scaleDownConfig)).toEqual(0);
    });

    it('1 of 2 cron configurations be active', async () => {
      const scaleDownConfig = getConfig(['* * * * * ' + ((now.day() + 1) % 7), '* * * * * ' + (now.day() % 7)]);
      expect(getIdleRunnerCount(scaleDownConfig)).toEqual(DEFAULT_IDLE_COUNT);
    });
  });
});

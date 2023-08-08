import moment from 'moment-timezone';

import { EvictionStrategy, ScalingDownConfigList, getEvictionStrategy, getIdleRunnerCount } from './scale-down-config';

const DEFAULT_TIMEZONE = 'America/Los_Angeles';
const DEFAULT_IDLE_COUNT = 1;
const DEFAULT_EVICTION_STRATEGY: EvictionStrategy = 'oldest_first';
const now = moment.tz(new Date(), 'America/Los_Angeles');

function getConfig(
  cronTabs: string[],
  evictionStrategy: EvictionStrategy | undefined = undefined,
): ScalingDownConfigList {
  return cronTabs.map((cron) => ({
    cron: cron,
    idleCount: DEFAULT_IDLE_COUNT,
    timeZone: DEFAULT_TIMEZONE,
    evictionStrategy,
  }));
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

  describe('Determine eviction strategy.', () => {
    it('Default eviction strategy', async () => {
      const scaleDownConfig = getConfig(['* * * * * *']);
      expect(getEvictionStrategy(scaleDownConfig)).toEqual('oldest_first');
    });

    it('Overriding eviction strategy to newest_first', async () => {
      const scaleDownConfig = getConfig(['* * * * * *'], 'newest_first');
      expect(getEvictionStrategy(scaleDownConfig)).toEqual('newest_first');
    });

    it('No active cron configuration', async () => {
      const scaleDownConfig = getConfig(['* * * * * ' + ((now.day() + 1) % 7)]);
      expect(getEvictionStrategy(scaleDownConfig)).toEqual(DEFAULT_EVICTION_STRATEGY);
    });
  });
});

import moment from 'moment';
import { describe, expect, it } from 'vitest';

import { newestFirstStrategy, oldestFirstStrategy } from './scale-down';
import type { RunnerInfo } from './scale-down-provider';

describe('When runners are sorted', () => {
  const runners: RunnerInfo[] = [
    {
      id: '1',
      launchTime: moment(new Date()).subtract(1, 'minute').toDate(),
      owner: 'owner',
      type: 'type',
    },
    {
      id: '3',
      launchTime: moment(new Date()).subtract(3, 'minute').toDate(),
      owner: 'owner',
      type: 'type',
    },
    {
      id: '2',
      launchTime: moment(new Date()).subtract(2, 'minute').toDate(),
      owner: 'owner',
      type: 'type',
    },
    {
      id: '0',
      launchTime: moment(new Date()).subtract(0, 'minute').toDate(),
      owner: 'owner',
      type: 'type',
    },
  ];

  it('Should sort runners descending for eviction strategy oldest first te keep the youngest.', () => {
    runners.sort(oldestFirstStrategy);
    expect(runners[0].id).toEqual('0');
    expect(runners[1].id).toEqual('1');
    expect(runners[2].id).toEqual('2');
    expect(runners[3].id).toEqual('3');
  });

  it('Should sort runners ascending for eviction strategy newest first te keep oldest.', () => {
    runners.sort(newestFirstStrategy);
    expect(runners[0].id).toEqual('3');
    expect(runners[1].id).toEqual('2');
    expect(runners[2].id).toEqual('1');
    expect(runners[3].id).toEqual('0');
  });

  it('Should sort runners with equal launch time.', () => {
    const runnersTest = [...runners];
    const same = moment(new Date()).subtract(4, 'minute').toDate();
    runnersTest.push({
      id: '4',
      launchTime: same,
      owner: 'owner',
      type: 'type',
    });
    runnersTest.push({
      id: '5',
      launchTime: same,
      owner: 'owner',
      type: 'type',
    });
    runnersTest.sort(oldestFirstStrategy);
    expect(runnersTest[3].launchTime).not.toEqual(same);
    expect(runnersTest[4].launchTime).toEqual(same);
    expect(runnersTest[5].launchTime).toEqual(same);

    runnersTest.sort(newestFirstStrategy);
    expect(runnersTest[3].launchTime).not.toEqual(same);
    expect(runnersTest[1].launchTime).toEqual(same);
    expect(runnersTest[0].launchTime).toEqual(same);
  });

  it('Should sort runners even when launch time is undefined.', () => {
    const runnersTest = [
      {
        id: '0',
        launchTime: undefined,
        owner: 'owner',
        type: 'type',
      },
      {
        id: '1',
        launchTime: moment(new Date()).subtract(3, 'minute').toDate(),
        owner: 'owner',
        type: 'type',
      },
      {
        id: '0',
        launchTime: undefined,
        owner: 'owner',
        type: 'type',
      },
    ];
    runnersTest.sort(oldestFirstStrategy);
    expect(runnersTest[0].launchTime).toBeUndefined();
    expect(runnersTest[1].launchTime).toBeDefined();
    expect(runnersTest[2].launchTime).not.toBeDefined();
  });
});

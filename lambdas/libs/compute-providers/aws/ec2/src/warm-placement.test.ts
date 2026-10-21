import { describe, expect, it } from 'vitest';

import { dealWarmShares, planWarmPlacement, type WarmPlacementInput, warmPlacementSignalNeeds } from './warm-placement';

const subnets = [
  { subnetId: 'subnet-a', azId: 'euw1-az1' },
  { subnetId: 'subnet-b', azId: 'euw1-az2' },
  { subnetId: 'subnet-c', azId: 'euw1-az3' },
];

function plan(overrides: Partial<WarmPlacementInput>) {
  return planWarmPlacement({
    capacityType: 'spot',
    strategy: 'diversified',
    instanceTypes: ['m7g.large', 'c7g.large'],
    subnets,
    ...overrides,
  });
}

const pairs = (placement: ReturnType<typeof plan>) =>
  placement.pairs.map(({ instanceType, subnetId }) => `${instanceType}@${subnetId}`);

describe('planWarmPlacement', () => {
  it('ranks AZs by placement score for capacity-optimized', () => {
    const placement = plan({
      strategy: 'capacity-optimized',
      signals: { azScores: { 'euw1-az1': 3, 'euw1-az2': 9, 'euw1-az3': 6 } },
    });

    expect(placement.effectiveStrategy).toBe('capacity-optimized');
    expect(placement.spread).toBe(true);
    expect(pairs(placement)).toEqual([
      'm7g.large@subnet-b',
      'c7g.large@subnet-b',
      'm7g.large@subnet-c',
      'c7g.large@subnet-c',
      'm7g.large@subnet-a',
      'c7g.large@subnet-a',
    ]);
  });

  it('orders instance types by priority within the same score for capacity-optimized-prioritized', () => {
    const placement = plan({
      strategy: 'capacity-optimized-prioritized',
      instanceTypePriorities: { 'm7g.large': 2, 'c7g.large': 1 },
      signals: { azScores: { 'euw1-az1': 9, 'euw1-az2': 9, 'euw1-az3': 1 } },
    });

    expect(pairs(placement).slice(0, 4)).toEqual([
      'c7g.large@subnet-a',
      'c7g.large@subnet-b',
      'm7g.large@subnet-a',
      'm7g.large@subnet-b',
    ]);
  });

  it('ranks by score, then price, for price-capacity-optimized', () => {
    const placement = plan({
      strategy: 'price-capacity-optimized',
      signals: {
        azScores: { 'euw1-az1': 9, 'euw1-az2': 9, 'euw1-az3': 2 },
        prices: {
          'm7g.large|euw1-az1': 0.05,
          'c7g.large|euw1-az1': 0.03,
          'm7g.large|euw1-az2': 0.04,
          'c7g.large|euw1-az2': 0.06,
          'm7g.large|euw1-az3': 0.01,
        },
      },
    });

    expect(pairs(placement).slice(0, 4)).toEqual([
      'c7g.large@subnet-a',
      'm7g.large@subnet-b',
      'm7g.large@subnet-a',
      'c7g.large@subnet-b',
    ]);
  });

  it('ranks by current price for lowest-price', () => {
    const placement = plan({
      strategy: 'lowest-price',
      signals: { prices: { 'c7g.large|euw1-az3': 0.01, 'm7g.large|euw1-az2': 0.02 } },
    });

    expect(pairs(placement).slice(0, 3)).toEqual(['c7g.large@subnet-c', 'm7g.large@subnet-b', 'm7g.large@subnet-a']);
  });

  it('cleans up a strategy that is not valid for spot to lowest-price', () => {
    const placement = plan({ strategy: 'prioritized', signals: { prices: { 'c7g.large|euw1-az2': 0.01 } } });

    expect(placement.effectiveStrategy).toBe('lowest-price');
    expect(pairs(placement)[0]).toBe('c7g.large@subnet-b');
  });

  it('keeps the AZ-interleaved order when signals are missing', () => {
    expect(pairs(plan({ strategy: 'capacity-optimized' }))).toEqual(pairs(plan({ strategy: 'diversified' })));
    expect(pairs(plan({ strategy: 'diversified' }))).toEqual([
      'm7g.large@subnet-a',
      'm7g.large@subnet-b',
      'm7g.large@subnet-c',
      'c7g.large@subnet-a',
      'c7g.large@subnet-b',
      'c7g.large@subnet-c',
    ]);
  });

  it('interleaves several subnets of one AZ with the other AZs', () => {
    const placement = plan({
      instanceTypes: ['m7g.large'],
      subnets: [
        { subnetId: 'subnet-a1', azId: 'euw1-az1' },
        { subnetId: 'subnet-a2', azId: 'euw1-az1' },
        { subnetId: 'subnet-b', azId: 'euw1-az2' },
      ],
    });

    expect(pairs(placement)).toEqual(['m7g.large@subnet-a1', 'm7g.large@subnet-b', 'm7g.large@subnet-a2']);
  });

  it('keeps on-demand in configuration order without spreading', () => {
    const placement = plan({ capacityType: 'on-demand', strategy: 'lowest-price' });

    expect(placement.spread).toBe(false);
    expect(pairs(placement)).toEqual([
      'm7g.large@subnet-a',
      'm7g.large@subnet-b',
      'm7g.large@subnet-c',
      'c7g.large@subnet-a',
      'c7g.large@subnet-b',
      'c7g.large@subnet-c',
    ]);
  });

  it('tries on-demand types in priority order for prioritized', () => {
    const placement = plan({
      capacityType: 'on-demand',
      strategy: 'prioritized',
      instanceTypePriorities: { 'm7g.large': 5, 'c7g.large': 1 },
    });

    expect(placement.effectiveStrategy).toBe('prioritized');
    expect(pairs(placement)[0]).toBe('c7g.large@subnet-a');
  });
});

describe('warmPlacementSignalNeeds', () => {
  it.each([
    ['capacity-optimized', { scores: true, prices: false }],
    ['capacity-optimized-prioritized', { scores: true, prices: false }],
    ['price-capacity-optimized', { scores: true, prices: true }],
    ['lowest-price', { scores: false, prices: true }],
    ['diversified', { scores: false, prices: false }],
  ])('needs the right spot signals for %s', (strategy, needs) => {
    expect(warmPlacementSignalNeeds('spot', strategy)).toEqual(needs);
  });

  it('needs no signals for on-demand', () => {
    expect(warmPlacementSignalNeeds('on-demand', 'lowest-price')).toEqual({ scores: false, prices: false });
  });
});

describe('dealWarmShares', () => {
  it.each([
    [2, 6, [1, 1, 0, 0, 0, 0]],
    [6, 6, [1, 1, 1, 1, 1, 1]],
    [8, 6, [2, 2, 1, 1, 1, 1]],
    [3, 0, []],
    [0, 3, [0, 0, 0]],
  ])('deals %i instances over %i pairs round-robin', (count, slots, shares) => {
    expect(dealWarmShares(count, slots, true)).toEqual(shares);
  });

  it('gives everything to the first pair when not spreading', () => {
    expect(dealWarmShares(4, 3, false)).toEqual([4, 0, 0]);
  });
});

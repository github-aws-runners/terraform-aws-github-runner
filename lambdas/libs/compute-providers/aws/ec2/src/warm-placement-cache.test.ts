import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ec2SdkError } from '../../../test/aws-sdk-errors';
import type { WarmIndexStore, WarmPlacementCache } from './warm-index';
import {
  resolveWarmPlacementSignals,
  WARM_PLACEMENT_REFRESH_SECONDS,
  type WarmPlacementSignalRequest,
} from './warm-placement-cache';
import type { Ec2PlacementSignalOperations } from './warm-placement-signals';

const NOW = 1_800_000_000;

const index = {
  readPlacement: vi.fn<WarmIndexStore['readPlacement']>(),
  writePlacement: vi.fn<WarmIndexStore['writePlacement']>(),
};
const signalOperations = {
  describeSubnetAzIds: vi.fn<Ec2PlacementSignalOperations['describeSubnetAzIds']>(),
  getSpotPlacementScores: vi.fn<Ec2PlacementSignalOperations['getSpotPlacementScores']>(),
  getSpotPrices: vi.fn<Ec2PlacementSignalOperations['getSpotPrices']>(),
} satisfies Ec2PlacementSignalOperations;

const request: WarmPlacementSignalRequest = {
  capacityType: 'spot',
  strategy: 'price-capacity-optimized',
  instanceTypes: ['m7g.large', 'c7g.large', 'r7g.large'],
  subnets: ['subnet-a', 'subnet-b'],
  targetCapacity: 6,
  region: 'eu-west-1',
  productDescription: 'Linux/UNIX',
};

const resolve = (overrides: Partial<WarmPlacementSignalRequest> = {}, now = NOW) =>
  resolveWarmPlacementSignals({ ...request, ...overrides }, index, signalOperations, now);

function storedCache(): WarmPlacementCache {
  return index.writePlacement.mock.calls[0][0];
}

beforeEach(() => {
  vi.resetAllMocks();
  index.readPlacement.mockResolvedValue(undefined);
  index.writePlacement.mockResolvedValue();
  signalOperations.describeSubnetAzIds.mockResolvedValue({ 'subnet-a': 'euw1-az1', 'subnet-b': 'euw1-az2' });
  signalOperations.getSpotPlacementScores.mockResolvedValue({ 'euw1-az1': 4, 'euw1-az2': 9 });
  signalOperations.getSpotPrices.mockResolvedValue({ 'm7g.large|euw1-az1': 0.03 });
});

describe('resolveWarmPlacementSignals', () => {
  it('reads and caches the signals the strategy needs', async () => {
    await expect(resolve()).resolves.toEqual({
      source: 'fresh',
      subnetAzIds: { 'subnet-a': 'euw1-az1', 'subnet-b': 'euw1-az2' },
      signals: { azScores: { 'euw1-az1': 4, 'euw1-az2': 9 }, prices: { 'm7g.large|euw1-az1': 0.03 } },
    });
    expect(signalOperations.getSpotPlacementScores).toHaveBeenCalledWith({
      instanceTypes: request.instanceTypes,
      targetCapacity: 6,
      region: 'eu-west-1',
    });
    expect(signalOperations.getSpotPrices).toHaveBeenCalledWith({
      instanceTypes: request.instanceTypes,
      productDescription: 'Linux/UNIX',
    });
    expect(storedCache()).toEqual(
      expect.objectContaining({ fetchedAt: NOW, expiresAt: NOW + WARM_PLACEMENT_REFRESH_SECONDS }),
    );
  });

  it('reads AWS once for refills within the refresh interval', async () => {
    await resolve();
    index.readPlacement.mockResolvedValue(storedCache());

    await expect(resolve({}, NOW + 60)).resolves.toEqual(expect.objectContaining({ source: 'cached' }));
    await expect(resolve({}, NOW + 600)).resolves.toEqual(expect.objectContaining({ source: 'cached' }));

    expect(signalOperations.getSpotPlacementScores).toHaveBeenCalledTimes(1);
    expect(signalOperations.getSpotPrices).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired cache', async () => {
    await resolve();
    index.readPlacement.mockResolvedValue(storedCache());

    await expect(resolve({}, NOW + WARM_PLACEMENT_REFRESH_SECONDS)).resolves.toEqual(
      expect.objectContaining({ source: 'fresh' }),
    );
    expect(signalOperations.getSpotPlacementScores).toHaveBeenCalledTimes(2);
  });

  it('refreshes a cache read for another configuration', async () => {
    await resolve();
    index.readPlacement.mockResolvedValue(storedCache());

    await expect(resolve({ instanceTypes: ['m7g.large'] }, NOW + 60)).resolves.toEqual(
      expect.objectContaining({ source: 'fresh' }),
    );
  });

  it('reads only placement scores for capacity-optimized', async () => {
    await resolve({ strategy: 'capacity-optimized' });

    expect(signalOperations.getSpotPlacementScores).toHaveBeenCalled();
    expect(signalOperations.getSpotPrices).not.toHaveBeenCalled();
  });

  it.each([
    ['on-demand', 'lowest-price'],
    ['spot', 'diversified'],
  ])('reads no signals for %s with %s', async (capacityType, strategy) => {
    await expect(resolve({ capacityType, strategy })).resolves.toEqual({
      source: 'not-needed',
      subnetAzIds: {},
      signals: {},
    });
    expect(index.readPlacement).not.toHaveBeenCalled();
    expect(signalOperations.describeSubnetAzIds).not.toHaveBeenCalled();
  });

  it('uses a recently expired cache when a refresh fails', async () => {
    await resolve();
    index.readPlacement.mockResolvedValue(storedCache());
    signalOperations.getSpotPlacementScores.mockRejectedValue(await ec2SdkError('RequestLimitExceeded'));

    await expect(resolve({}, NOW + WARM_PLACEMENT_REFRESH_SECONDS + 60)).resolves.toEqual({
      source: 'stale',
      subnetAzIds: { 'subnet-a': 'euw1-az1', 'subnet-b': 'euw1-az2' },
      signals: { azScores: { 'euw1-az1': 4, 'euw1-az2': 9 }, prices: { 'm7g.large|euw1-az1': 0.03 } },
      error: { operation: 'spot-placement', code: 'RequestLimitExceeded' },
    });
  });

  it('reports the signals unavailable when a refresh fails without a usable cache', async () => {
    await resolve();
    index.readPlacement.mockResolvedValue(storedCache());
    signalOperations.getSpotPlacementScores.mockRejectedValue(await ec2SdkError('UnauthorizedOperation'));

    await expect(resolve({}, NOW + 2 * WARM_PLACEMENT_REFRESH_SECONDS)).resolves.toEqual({
      source: 'unavailable',
      subnetAzIds: {},
      signals: {},
      error: { operation: 'spot-placement', code: 'UnauthorizedOperation' },
    });
  });

  it('still uses fresh signals when caching them fails', async () => {
    index.writePlacement.mockRejectedValue(new Error('boom'));

    await expect(resolve()).resolves.toEqual(expect.objectContaining({ source: 'fresh' }));
  });

  it('refreshes when the cache cannot be read', async () => {
    index.readPlacement.mockRejectedValue(new Error('boom'));

    await expect(resolve()).resolves.toEqual(expect.objectContaining({ source: 'fresh' }));
  });
});

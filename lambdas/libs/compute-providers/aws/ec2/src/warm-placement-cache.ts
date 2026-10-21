import { createChildLogger } from '@aws-github-runner/aws-powertools-util';
import { createHash } from 'node:crypto';

import type { StandbyReconcileError } from '../../../core';
import { awsErrorCode, failureDetails } from './runners';
import type { WarmIndexStore, WarmPlacementCache } from './warm-index';
import { type WarmPlacementSignals, warmPlacementSignalNeeds } from './warm-placement';
import type { Ec2PlacementSignalOperations } from './warm-placement-signals';

const logger = createChildLogger('warm-placement');

export const WARM_PLACEMENT_REFRESH_SECONDS = 15 * 60;
export const WARM_PLACEMENT_ERROR_OPERATION = 'spot-placement';

export type WarmPlacementSignalSource = 'fresh' | 'cached' | 'stale' | 'unavailable' | 'not-needed';

export interface WarmPlacementSignalRequest {
  capacityType: string;
  strategy: string;
  instanceTypes: string[];
  subnets: string[];
  targetCapacity: number;
  region: string;
  productDescription: string;
}

export interface ResolvedWarmPlacementSignals {
  source: WarmPlacementSignalSource;
  subnetAzIds: Record<string, string>;
  signals: WarmPlacementSignals;
  error?: StandbyReconcileError;
}

function configHash(request: WarmPlacementSignalRequest): string {
  const needs = warmPlacementSignalNeeds(request.capacityType, request.strategy);
  const { instanceTypes, subnets, targetCapacity, region, productDescription } = request;
  return createHash('sha256')
    .update(JSON.stringify({ instanceTypes, subnets, targetCapacity, region, productDescription, needs }))
    .digest('hex');
}

function fromCache(cache: WarmPlacementCache): Pick<ResolvedWarmPlacementSignals, 'subnetAzIds' | 'signals'> {
  return {
    subnetAzIds: cache.subnetAzIds,
    signals: {
      ...(cache.azScores ? { azScores: cache.azScores } : {}),
      ...(cache.prices ? { prices: cache.prices } : {}),
    },
  };
}

async function readCache(index: Pick<WarmIndexStore, 'readPlacement'>): Promise<WarmPlacementCache | undefined> {
  try {
    return await index.readPlacement();
  } catch (error) {
    logger.warn('Failed to read the cached warm placement signals.', failureDetails(error));
    return undefined;
  }
}

/** Reads the signals the strategy needs from the cache, refreshing them from AWS once the cache expired. */
export async function resolveWarmPlacementSignals(
  request: WarmPlacementSignalRequest,
  index: Pick<WarmIndexStore, 'readPlacement' | 'writePlacement'>,
  signalOperations: Ec2PlacementSignalOperations,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<ResolvedWarmPlacementSignals> {
  const needs = warmPlacementSignalNeeds(request.capacityType, request.strategy);
  if (!needs.scores && !needs.prices) return { source: 'not-needed', subnetAzIds: {}, signals: {} };

  const hash = configHash(request);
  const cached = await readCache(index);
  const matching = cached?.configHash === hash ? cached : undefined;
  if (matching && nowSeconds < matching.expiresAt) return { source: 'cached', ...fromCache(matching) };

  try {
    const subnetAzIds = await signalOperations.describeSubnetAzIds(request.subnets);
    const azScores = needs.scores
      ? await signalOperations.getSpotPlacementScores({
          instanceTypes: request.instanceTypes,
          targetCapacity: request.targetCapacity,
          region: request.region,
        })
      : undefined;
    const prices = needs.prices
      ? await signalOperations.getSpotPrices({
          instanceTypes: request.instanceTypes,
          productDescription: request.productDescription,
        })
      : undefined;
    const cache: WarmPlacementCache = {
      configHash: hash,
      fetchedAt: nowSeconds,
      expiresAt: nowSeconds + WARM_PLACEMENT_REFRESH_SECONDS,
      subnetAzIds,
      ...(azScores ? { azScores } : {}),
      ...(prices ? { prices } : {}),
    };
    try {
      await index.writePlacement(cache);
    } catch (error) {
      logger.warn('Failed to cache the warm placement signals.', failureDetails(error));
    }
    return { source: 'fresh', ...fromCache(cache) };
  } catch (error) {
    const reconcileError = { operation: WARM_PLACEMENT_ERROR_OPERATION, code: awsErrorCode(error) ?? 'UnknownError' };
    logger.warn('Failed to read the warm placement signals.', failureDetails(error));
    if (matching && nowSeconds < matching.expiresAt + WARM_PLACEMENT_REFRESH_SECONDS) {
      return { source: 'stale', ...fromCache(matching), error: reconcileError };
    }
    return { source: 'unavailable', subnetAzIds: {}, signals: {}, error: reconcileError };
  }
}

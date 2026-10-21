import { sanitizeAllocationStrategy } from './runners';

export interface WarmPlacementSubnet {
  subnetId: string;
  azId?: string;
}

export interface WarmPlacementSignals {
  /** Spot placement score per AZ ID. */
  azScores?: Record<string, number>;
  /** Current Spot price per `<instance type>|<AZ ID>`. */
  prices?: Record<string, number>;
}

export interface WarmPlacementInput {
  capacityType: string;
  strategy: string;
  instanceTypes: string[];
  instanceTypePriorities?: Record<string, number>;
  subnets: WarmPlacementSubnet[];
  signals?: WarmPlacementSignals;
}

export interface WarmPlacementPair {
  instanceType: string;
  subnetId: string;
  azId?: string;
  score?: number;
  price?: number;
}

export interface WarmPlacement {
  effectiveStrategy: string;
  /** Spot refills are dealt over the ranked pairs; on-demand refills fill pairs one after another. */
  spread: boolean;
  pairs: WarmPlacementPair[];
}

export interface WarmPlacementSignalNeeds {
  scores: boolean;
  prices: boolean;
}

const SCORE_STRATEGIES = new Set(['capacity-optimized', 'capacity-optimized-prioritized', 'price-capacity-optimized']);
const PRICE_STRATEGIES = new Set(['lowest-price', 'price-capacity-optimized']);

export function effectiveWarmStrategy(capacityType: string, strategy: string): string {
  return sanitizeAllocationStrategy(strategy, capacityType);
}

export function warmPlacementSignalNeeds(capacityType: string, strategy: string): WarmPlacementSignalNeeds {
  if (capacityType !== 'spot') return { scores: false, prices: false };
  const effective = effectiveWarmStrategy(capacityType, strategy);
  return { scores: SCORE_STRATEGIES.has(effective), prices: PRICE_STRATEGIES.has(effective) };
}

export function priceKey(instanceType: string, azId: string): string {
  return `${instanceType}|${azId}`;
}

// Round-robin over AZs so neighbouring pairs in the base order differ by AZ.
function interleaveByAz(subnets: WarmPlacementSubnet[]): WarmPlacementSubnet[] {
  const groups = new Map<string, WarmPlacementSubnet[]>();
  for (const subnet of subnets) {
    const key = subnet.azId ?? subnet.subnetId;
    groups.set(key, [...(groups.get(key) ?? []), subnet]);
  }
  const interleaved: WarmPlacementSubnet[] = [];
  const columns = [...groups.values()];
  for (let row = 0; interleaved.length < subnets.length; row++) {
    for (const column of columns) if (row < column.length) interleaved.push(column[row]);
  }
  return interleaved;
}

function typePriority(input: WarmPlacementInput, instanceType: string): number {
  return input.instanceTypePriorities?.[instanceType] ?? input.instanceTypes.indexOf(instanceType);
}

export function planWarmPlacement(input: WarmPlacementInput): WarmPlacement {
  const effectiveStrategy = effectiveWarmStrategy(input.capacityType, input.strategy);
  const spot = input.capacityType === 'spot';
  const prioritized = effectiveStrategy === 'prioritized' || effectiveStrategy === 'capacity-optimized-prioritized';
  const types = prioritized
    ? [...input.instanceTypes].sort((a, b) => typePriority(input, a) - typePriority(input, b))
    : input.instanceTypes;
  const subnets = spot ? interleaveByAz(input.subnets) : input.subnets;

  const scores = input.signals?.azScores;
  const prices = input.signals?.prices;
  const pairs: WarmPlacementPair[] = types.flatMap((instanceType) =>
    subnets.map(({ subnetId, azId }) => ({
      instanceType,
      subnetId,
      ...(azId ? { azId } : {}),
      ...(azId && scores?.[azId] !== undefined ? { score: scores[azId] } : {}),
      ...(azId && prices?.[priceKey(instanceType, azId)] !== undefined
        ? { price: prices[priceKey(instanceType, azId)] }
        : {}),
    })),
  );
  if (!spot) return { effectiveStrategy, spread: false, pairs };

  const byScore = (a: WarmPlacementPair, b: WarmPlacementPair) => (b.score ?? -Infinity) - (a.score ?? -Infinity);
  const byPrice = (a: WarmPlacementPair, b: WarmPlacementPair) => (a.price ?? Infinity) - (b.price ?? Infinity);
  const byPriority = (a: WarmPlacementPair, b: WarmPlacementPair) =>
    typePriority(input, a.instanceType) - typePriority(input, b.instanceType);
  const keys: Record<string, ((a: WarmPlacementPair, b: WarmPlacementPair) => number)[]> = {
    'capacity-optimized': [byScore],
    'capacity-optimized-prioritized': [byScore, byPriority],
    'price-capacity-optimized': [byScore, byPrice],
    'lowest-price': [byPrice],
    diversified: [],
  };
  const comparators = keys[effectiveStrategy] ?? [];
  const ranked = [...pairs].sort((a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0 && !Number.isNaN(result)) return result;
    }
    return 0;
  });
  return { effectiveStrategy, spread: true, pairs: ranked };
}

/** Shares of `count` instances over `slots` ranked pairs: round-robin when spreading, all on the first otherwise. */
export function dealWarmShares(count: number, slots: number, spread: boolean): number[] {
  if (slots <= 0 || count <= 0) return Array.from({ length: Math.max(slots, 0) }, () => 0);
  if (!spread) return Array.from({ length: slots }, (_, index) => (index === 0 ? count : 0));
  return Array.from({ length: slots }, (_, index) => Math.floor(count / slots) + (index < count % slots ? 1 : 0));
}

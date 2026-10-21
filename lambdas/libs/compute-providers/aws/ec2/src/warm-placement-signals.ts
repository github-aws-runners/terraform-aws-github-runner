import {
  DescribeSpotPriceHistoryCommand,
  DescribeSubnetsCommand,
  type EC2Client,
  GetSpotPlacementScoresCommand,
  type RIProductDescription,
  type _InstanceType,
} from '@aws-sdk/client-ec2';

import { type Ec2RunnerRequestContext, runWithRequestSignal } from './runners';
import { priceKey } from './warm-placement';

export interface Ec2SpotPlacementScoresInput {
  instanceTypes: string[];
  targetCapacity: number;
  region: string;
}

export interface Ec2SpotPricesInput {
  instanceTypes: string[];
  productDescription: string;
}

export interface Ec2PlacementSignalOperations {
  /** Subnet ID to AZ ID. */
  describeSubnetAzIds(subnetIds: string[]): Promise<Record<string, string>>;
  /** AZ ID to Spot placement score (1-10). */
  getSpotPlacementScores(input: Ec2SpotPlacementScoresInput): Promise<Record<string, number>>;
  /** `<instance type>|<AZ ID>` to the current Spot price. */
  getSpotPrices(input: Ec2SpotPricesInput): Promise<Record<string, number>>;
}

export interface Ec2PlacementSignalClient {
  forRequest(context: Ec2RunnerRequestContext): Ec2PlacementSignalOperations;
}

export function createEc2PlacementSignalClient(ec2Client: EC2Client): Ec2PlacementSignalClient {
  return {
    forRequest: ({ signal }) => ({
      describeSubnetAzIds: (subnetIds) =>
        runWithRequestSignal(signal, async () => {
          const result = await ec2Client.send(new DescribeSubnetsCommand({ SubnetIds: subnetIds }), {
            abortSignal: signal,
          });
          return Object.fromEntries(
            (result.Subnets ?? []).flatMap(({ SubnetId, AvailabilityZoneId }) =>
              SubnetId && AvailabilityZoneId ? [[SubnetId, AvailabilityZoneId]] : [],
            ),
          );
        }),
      getSpotPlacementScores: ({ instanceTypes, targetCapacity, region }) =>
        runWithRequestSignal(signal, async () => {
          const scores: Record<string, number> = {};
          let nextToken: string | undefined;
          do {
            const result = await ec2Client.send(
              new GetSpotPlacementScoresCommand({
                InstanceTypes: instanceTypes,
                TargetCapacity: Math.max(targetCapacity, 1),
                SingleAvailabilityZone: true,
                ...(region ? { RegionNames: [region] } : {}),
                NextToken: nextToken,
              }),
              { abortSignal: signal },
            );
            for (const { AvailabilityZoneId, Score } of result.SpotPlacementScores ?? []) {
              if (AvailabilityZoneId && Score !== undefined) scores[AvailabilityZoneId] = Score;
            }
            nextToken = result.NextToken;
          } while (nextToken);
          return scores;
        }),
      getSpotPrices: ({ instanceTypes, productDescription }) =>
        runWithRequestSignal(signal, async () => {
          const prices: Record<string, number> = {};
          let nextToken: string | undefined;
          // A start time of now returns only the current price of each type and AZ.
          const startTime = new Date();
          do {
            const result = await ec2Client.send(
              new DescribeSpotPriceHistoryCommand({
                InstanceTypes: instanceTypes as _InstanceType[],
                ProductDescriptions: [productDescription as RIProductDescription],
                StartTime: startTime,
                NextToken: nextToken,
              }),
              { abortSignal: signal },
            );
            for (const { InstanceType, AvailabilityZoneId, SpotPrice } of result.SpotPriceHistory ?? []) {
              const price = Number(SpotPrice);
              const key = InstanceType && AvailabilityZoneId ? priceKey(InstanceType, AvailabilityZoneId) : undefined;
              if (key && Number.isFinite(price) && !(key in prices)) prices[key] = price;
            }
            nextToken = result.NextToken || undefined;
          } while (nextToken);
          return prices;
        }),
    }),
  };
}

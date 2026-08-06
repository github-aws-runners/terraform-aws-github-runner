export const computeProviderTypes = ['ec2'] as const;

export type ComputeProviderType = (typeof computeProviderTypes)[number];

export const defaultComputeProvider = 'ec2' satisfies ComputeProviderType;

export function resolveComputeProviderType(type: unknown): ComputeProviderType {
  if (type === undefined) return defaultComputeProvider;
  if (typeof type !== 'string') {
    throw new Error(`Unsupported compute provider type '${String(type)}'`);
  }

  const normalizedType = type.trim().toLowerCase();
  if (!normalizedType) return defaultComputeProvider;

  const computeProviderType = computeProviderTypes.find((provider) => provider === normalizedType);
  if (!computeProviderType) {
    throw new Error(`Unsupported compute provider type '${String(type)}'`);
  }

  return computeProviderType;
}

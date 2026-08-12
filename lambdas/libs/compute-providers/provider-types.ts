export const computeProviderTypes = ['ec2'] as const;

export type ComputeProviderType = (typeof computeProviderTypes)[number];

export const defaultComputeProvider = 'ec2' satisfies ComputeProviderType;

export function normalizeComputeProviderType(type: unknown): ComputeProviderType | undefined {
  if (type === undefined) return defaultComputeProvider;
  if (typeof type !== 'string') return undefined;

  const normalizedType = type.trim().toLowerCase();
  if (!normalizedType) return defaultComputeProvider;

  return computeProviderTypes.find((computeProviderType) => computeProviderType === normalizedType);
}

export function resolveComputeProviderType(type: unknown): ComputeProviderType {
  const normalizedType = normalizeComputeProviderType(type);
  if (!normalizedType) {
    throw new Error(`Unsupported compute provider type '${String(type)}'`);
  }

  return normalizedType;
}

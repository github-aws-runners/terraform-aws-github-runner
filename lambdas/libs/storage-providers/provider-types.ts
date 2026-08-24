export const storageProviderTypes = ['aws_ssm'] as const;

export type StorageProviderType = (typeof storageProviderTypes)[number];

export const defaultStorageProvider = 'aws_ssm' satisfies StorageProviderType;

export function normalizeStorageProviderType(type: unknown): StorageProviderType | undefined {
  if (type === undefined) return defaultStorageProvider;
  if (typeof type !== 'string') return undefined;

  const normalizedType = type.trim().toLowerCase();
  if (!normalizedType) return defaultStorageProvider;

  return storageProviderTypes.find((storageProviderType) => storageProviderType === normalizedType);
}

export function resolveStorageProviderType(type: unknown): StorageProviderType {
  const normalizedType = normalizeStorageProviderType(type);
  if (!normalizedType) {
    throw new Error(`Unsupported storage provider type '${String(type)}'`);
  }

  return normalizedType;
}

export function parseSsmTokenTtlSeconds(ttl: string | undefined): number | undefined {
  if (!ttl || ttl.trim() === '') {
    return undefined;
  }
  const ttlSeconds = parseInt(ttl);
  if (isNaN(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error(`SSM_TOKEN_TTL_SECONDS must be a positive number, got "${ttl}"`);
  }
  return ttlSeconds;
}

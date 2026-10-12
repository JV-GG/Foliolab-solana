/**
 * Tiny in-memory cache for Route Handlers. Every open tab polls /api/vaults and /api/history; with a
 * free shared RPC that quickly hits rate limits. Requests within `ttlMs` share one result, and
 * concurrent requests share one in-flight call. Per server instance only; display data, not prices.
 */
const entries = new Map<string, {at: number; value: Promise<unknown>}>();

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  entries.set(key, {at: Date.now(), value});
  // A failure must not be cached: the next request retries.
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}

// Same per-user, per-process sliding window approach as the dice-rolls route.
// A multi-instance deployment would need a shared store.
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;
const recentImports = new Map<string, number[]>();

export function importRateLimited(userId: string, now = Date.now()): boolean {
  const hits = (recentImports.get(userId) ?? []).filter(t => now - t < WINDOW_MS);
  const limited = hits.length >= MAX_REQUESTS;
  if (!limited) hits.push(now);
  recentImports.set(userId, hits);
  if (recentImports.size > 5000) {
    for (const [id, times] of recentImports) {
      if (!times.some(t => now - t < WINDOW_MS)) recentImports.delete(id);
    }
  }
  return limited;
}

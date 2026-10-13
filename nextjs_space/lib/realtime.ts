import { EventEmitter } from 'node:events';

// In-process pub/sub for live campaign updates. Events are *invalidations
// only* (topic + optional version) — never payload data. Clients refetch via
// the normal REST routes, which apply per-viewer filtering (hidden tokens,
// locked creature info, secret rolls). Single `next start` process, so an
// in-memory bus is enough; swap for Postgres LISTEN/NOTIFY if we ever scale out.

export type RealtimeTopic = 'battle' | 'rolls' | 'characters' | 'loot';
export type RealtimeEvent = { topic: RealtimeTopic; version?: number; gmOnly?: boolean; at: number };

const g = globalThis as unknown as { __qbRealtimeBus?: EventEmitter };
export const bus: EventEmitter = g.__qbRealtimeBus ?? (g.__qbRealtimeBus = new EventEmitter());
bus.setMaxListeners(0);

const channel = (campaignId: string) => `campaign:${campaignId}`;

/** Notify subscribers that `topic` changed in a campaign. Call only after the write committed. Never throws. */
export function publish(campaignId: string, topic: RealtimeTopic, opts: { version?: number; gmOnly?: boolean } = {}): void {
  try {
    if (!campaignId) return;
    const evt: RealtimeEvent = { topic, at: Date.now() };
    if (typeof opts.version === 'number') evt.version = opts.version;
    if (opts.gmOnly) evt.gmOnly = true;
    bus.emit(channel(campaignId), evt);
  } catch {
    // Live updates are best-effort; polling is the fallback.
  }
}

/** Subscribe to a campaign's events. Returns an unsubscribe function. */
export function subscribe(campaignId: string, fn: (evt: RealtimeEvent) => void): () => void {
  const ch = channel(campaignId);
  bus.on(ch, fn);
  return () => { bus.off(ch, fn); };
}

export function listenerCount(campaignId: string): number {
  return bus.listenerCount(channel(campaignId));
}

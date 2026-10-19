import { EventEmitter } from 'node:events';

// In-process pub/sub for live campaign updates. Events are *invalidations
// only* (topic + optional version) — never payload data. Clients refetch via
// the normal REST routes, which apply per-viewer filtering (hidden tokens,
// locked creature info, secret rolls). Single `next start` process, so an
// in-memory bus is enough; swap for Postgres LISTEN/NOTIFY if we ever scale out.

export type RealtimeTopic = 'battle' | 'rolls' | 'characters' | 'loot' | 'bestiary';
// userIds: deliver only to these players (and the GM), e.g. one player's
// Bestiary unlocks changed. Omitted = every member.
export type RealtimeEvent = { topic: RealtimeTopic; version?: number; gmOnly?: boolean; userIds?: string[]; at: number };

const g = globalThis as unknown as { __qbRealtimeBus?: EventEmitter };
export const bus: EventEmitter = g.__qbRealtimeBus ?? (g.__qbRealtimeBus = new EventEmitter());
bus.setMaxListeners(0);

const channel = (campaignId: string) => `campaign:${campaignId}`;

/** Notify subscribers that `topic` changed in a campaign. Call only after the write committed. Never throws. */
export function publish(campaignId: string, topic: RealtimeTopic, opts: { version?: number; gmOnly?: boolean; userIds?: string[] } = {}): void {
  try {
    if (!campaignId) return;
    const evt: RealtimeEvent = { topic, at: Date.now() };
    if (typeof opts.version === 'number') evt.version = opts.version;
    if (opts.gmOnly) evt.gmOnly = true;
    if (opts.userIds) evt.userIds = [...opts.userIds];
    bus.emit(channel(campaignId), evt);
  } catch {
    // Live updates are best-effort; polling is the fallback.
  }
}

/** Whether a connection for (userId, role) should receive evt. GM gets everything. */
export function shouldDeliver(evt: RealtimeEvent, userId: string, role: string): boolean {
  if (role === 'dm') return true;
  if (evt.gmOnly) return false;
  return !evt.userIds || evt.userIds.includes(userId);
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

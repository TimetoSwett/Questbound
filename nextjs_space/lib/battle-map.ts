// Shared helpers for Campaign.battleMapState.

export const BATTLE_DEFAULTS = {
  gridWidth: 20, gridHeight: 20, tokens: [], highlights: [], fog: [], backgroundImage: null,
  turnOrder: [], activeId: null, feetPerSquare: 5, cellNumbers: true, handout: null,
  encounters: [], snapshots: [], drawings: [], texts: [], pins: [],
};

// GM-only keys that are never sent to players.
const GM_ONLY_KEYS = ['encounters', 'snapshots', 'notes', 'gmNotes', 'dmNotes'];

/**
 * Player view of the battle map. Removes GM-only data (saved encounters,
 * snapshots, notes), tokens flagged hidden, and anything placed on a fogged
 * cell (tokens, pins, text labels) so it can't be read from the network
 * response. The fog mask itself is kept: the client needs it to draw fog.
 * A player's own character tokens are always kept.
 */
export function sanitizeForPlayer(state: Record<string, any>, ownCharacterIds: string[] = []): Record<string, any> {
  const out: Record<string, any> = { ...state };
  for (const k of GM_ONLY_KEYS) delete out[k];
  out.encounters = [];
  out.snapshots = [];
  const fog = new Set<string>(Array.isArray(state.fog) ? state.fog : []);
  const own = new Set(ownCharacterIds);
  const fogged = (o: any) => o && fog.has(`${o.x},${o.y}`);
  const tokens = Array.isArray(state.tokens) ? state.tokens : [];
  out.tokens = tokens.filter((t: any) => {
    if (t?.characterId && own.has(t.characterId)) return true;
    return !t?.hidden && !fogged(t);
  });
  if (Array.isArray(state.pins)) out.pins = state.pins.filter((p: any) => !fogged(p));
  if (Array.isArray(state.texts)) out.texts = state.texts.filter((t: any) => !fogged(t));
  return out;
}

/** Every upload key referenced from a (possibly sanitized) battle map state. */
export function collectFileKeys(state: Record<string, any>): Set<string> {
  const keys = new Set<string>();
  const add = (k: unknown) => { if (typeof k === 'string' && k) keys.add(k); };
  const walk = (s: any) => {
    if (!s || typeof s !== 'object') return;
    add(s.backgroundImage);
    add(s.handout?.key);
    for (const t of Array.isArray(s.tokens) ? s.tokens : []) add(t?.portraitKey);
  };
  walk(state);
  for (const e of Array.isArray(state.encounters) ? state.encounters : []) walk(e);
  for (const sn of Array.isArray(state.snapshots) ? state.snapshots : []) walk(sn?.state);
  return keys;
}

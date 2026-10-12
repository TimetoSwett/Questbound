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

/**
 * Player view of tokens linked to bestiary creatures (token.creatureId).
 * Applies the same reveal rules as the Bestiary via presentCreature:
 *  - creature hidden, deleted, from another campaign, or unknown level: the
 *    token is removed entirely (like a hidden token);
 *  - name locked: label replaced by the runic card name, portrait removed;
 *  - defense locked: hp/maxHp removed (maxHp is the creature's hpMax).
 * Turn-order entries that belong to a removed token are dropped and entries
 * for relabelled tokens get the runic label, so names can't leak there.
 * Call on an already-sanitized player state.
 */
export async function filterLinkedTokensForPlayer(
  state: Record<string, any>,
  campaignId: string,
  fullTokens: any[] = Array.isArray(state.tokens) ? state.tokens : [],
): Promise<Record<string, any>> {
  const { prisma } = await import('@/lib/prisma');
  const { presentCreature } = await import('@/lib/creatures');
  const tokens: any[] = Array.isArray(state.tokens) ? state.tokens : [];
  const all: any[] = Array.isArray(fullTokens) ? fullTokens : tokens;
  const linkedIds = [...new Set(all.map((t) => t?.creatureId).filter((id) => typeof id === 'string' && id))] as string[];
  // Tokens not in the player's view (hidden/fogged) also hide their turn entries.
  const visibleIds = new Set(tokens.map((t) => t?.id));
  const relabel = new Map<string, string>();
  const removed = new Set<string>(all.filter((t) => t?.id && (t.hidden || !visibleIds.has(t.id))).map((t) => t.id));
  const out: Record<string, any> = { ...state };

  if (linkedIds.length > 0) {
    const creatures = await prisma.creature.findMany({ where: { id: { in: linkedIds }, campaignId } });
    const cards = new Map<string, Record<string, any> | null>();
    for (const c of creatures) cards.set(c.id, await presentCreature({ ...c, wikiPage: null } as any, 'player'));
    const visible: any[] = [];
    for (const t of tokens) {
      const cid = t?.creatureId;
      if (typeof cid !== 'string' || !cid) { visible.push(t); continue; }
      const card = cards.get(cid);
      if (!card) { removed.add(t.id); continue; }
      const unlocked: string[] = Array.isArray(card.unlockedSections) ? card.unlockedSections : [];
      const nt: any = { ...t };
      if (!(card.revealLevel === 'full' || unlocked.includes('name'))) {
        nt.label = typeof card.name === 'string' && card.name ? card.name : '???';
        delete nt.portraitKey;
        delete nt.characterName;
        relabel.set(t.id, nt.label);
      }
      if (!(card.revealLevel === 'full' || unlocked.includes('defense'))) {
        delete nt.hp;
        delete nt.maxHp;
      }
      visible.push(nt);
    }
    out.tokens = visible;
    for (const t of all) if (t?.creatureId && !cards.get(t.creatureId)) removed.add(t.id);
  }

  // Turn entries reference tokens by `tokenId` or by id `te_<ts>_<tokenId>`.
  const tokenOf = (e: any): string | undefined => {
    if (typeof e?.tokenId === 'string') return e.tokenId;
    for (const t of all) if (t?.id && typeof e?.id === 'string' && e.id.endsWith(`_${t.id}`)) return t.id;
    return undefined;
  };
  if (Array.isArray(state.turnOrder)) {
    out.turnOrder = state.turnOrder
      .filter((e: any) => { const tid = tokenOf(e); return !(tid && removed.has(tid)); })
      .map((e: any) => { const tid = tokenOf(e); return tid && relabel.has(tid) ? { ...e, label: relabel.get(tid) } : e; });
    if (out.activeId && !out.turnOrder.some((e: any) => e?.id === out.activeId)) out.activeId = null;
  }
  return out;
}

/** Remove a deleted character's tokens, including saved encounters and snapshots. */
export function removeCharacterTokens(state: Record<string, any>, characterId: string): Record<string, any> {
  const tokens: any[] = Array.isArray(state.tokens) ? state.tokens : [];
  const removedIds = tokens.filter((t) => t?.characterId === characterId).map((t) => t.id);
  const out = { ...state };
  if (Array.isArray(state.tokens)) out.tokens = tokens.filter((t) => t?.characterId !== characterId);
  if (Array.isArray(state.turnOrder)) {
    out.turnOrder = state.turnOrder.filter((e: any) =>
      e?.characterId !== characterId &&
      !removedIds.some((id) => e?.tokenId === id || (typeof e?.id === 'string' && e.id.endsWith(`_${id}`)))
    );
    if (out.activeId && !out.turnOrder.some((e: any) => e?.id === out.activeId)) out.activeId = null;
  }
  if (Array.isArray(state.encounters)) {
    out.encounters = state.encounters.map((e: any) => removeCharacterTokens(e, characterId));
  }
  if (Array.isArray(state.snapshots)) {
    out.snapshots = state.snapshots.map((s: any) => ({
      ...s,
      ...(s?.state ? { state: removeCharacterTokens(s.state, characterId) } : {}),
    }));
  }
  return out;
}

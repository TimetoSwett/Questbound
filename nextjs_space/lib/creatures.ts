// Shared helpers for Creature records (bestiary / NPC stat blocks).
import { z } from 'zod';
import type { Creature } from '@prisma/client';
import { getFileUrl } from '@/lib/s3';

// Mirrors lib/battle-map.ts: GM-only keys are never sent to players.
const GM_ONLY_KEYS = ['gmNotes'] as const;

// Fields a player may see on a revealed creature's basic card.
const PLAYER_CARD_KEYS = ['id', 'campaignId', 'name', 'type', 'subtype', 'size', 'isNpc', 'portraitPath', 'revealedToPlayers'] as const;

/** Where clause for listing: players only see creatures the GM revealed. */
export function creatureWhereFor(role: string, campaignId: string) {
  return role === 'dm' ? { campaignId } : { campaignId, revealedToPlayers: true };
}

/**
 * Player view of a creature, sanitized server-side. Hidden (unrevealed)
 * creatures return null so they never reach the network response; revealed
 * creatures are reduced to a basic card (name, type, size, portrait). Full
 * stats and gmNotes are DM only.
 */
export function sanitizeCreatureForPlayer(c: Creature): Record<string, unknown> | null {
  if (!c.revealedToPlayers) return null;
  const out: Record<string, unknown> = {};
  for (const k of PLAYER_CARD_KEYS) out[k] = c[k];
  for (const k of GM_ONLY_KEYS) delete out[k];
  return out;
}

type WikiRef = { id: string; title: string; visibility: string } | null | undefined;

/** Attach portraitUrl and a wiki link (dm_only titles never leak to players). */
export async function presentCreature(
  c: Creature & { wikiPage?: WikiRef },
  role: string,
): Promise<Record<string, unknown> | null> {
  const portraitUrl = c.portraitPath ? await getFileUrl(c.portraitPath) : null;
  const pg = c.wikiPage;
  const wikiPage = pg && (role === 'dm' || pg.visibility === 'shared') ? { id: pg.id, title: pg.title } : null;
  if (role === 'dm') {
    const { wikiPage: _w, ...rest } = c;
    return { ...rest, portraitUrl, wikiPage };
  }
  const card = sanitizeCreatureForPlayer(c);
  return card ? { ...card, portraitUrl, wikiPage } : null;
}

const jsonList = z.array(z.record(z.unknown()));
const score = z.number().int().nullable();

export const creatureInputSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().max(100),
  subtype: z.string().max(100),
  cr: z.string().max(20),
  alignment: z.string().max(50),
  size: z.string().max(30),
  isNpc: z.boolean(),
  portraitPath: z.string().max(500).nullable(),
  acTotal: z.number().int(),
  acTouch: z.number().int(),
  acFlatFooted: z.number().int(),
  hpMax: z.number().int(),
  hpCurrent: z.number().int(),
  hitDice: z.string().max(100),
  fort: z.number().int(),
  ref: z.number().int(),
  will: z.number().int(),
  str: score, dex: score, con: score, int: score, wis: score, cha: score,
  speed: z.number().int(),
  attacks: jsonList,
  skills: jsonList,
  feats: jsonList,
  specialAbilities: jsonList,
  spells: z.object({ slots: z.record(z.unknown()), known: jsonList }).passthrough(),
  gear: jsonList,
  wikiPageId: z.string().nullable(),
  gmNotes: z.string().max(100_000),
  revealedToPlayers: z.boolean(),
}).partial().strict();

export type CreatureInput = z.infer<typeof creatureInputSchema>;

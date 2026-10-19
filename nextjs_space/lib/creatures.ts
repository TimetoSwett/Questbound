// Shared helpers for Creature records (bestiary / NPC stat blocks).
import { z } from 'zod';
import type { Creature } from '@prisma/client';
import { getFileUrl } from '@/lib/s3';

// Knowledge reveal levels. On a creature, revealLevel is party-wide and only
// decides whether players see it at all ('hidden' or not). What a player can
// read is per player (CreatureReveal): the level a player sees is derived from
// their own unlocks by playerRevealLevel(). Towns reuse these level names.
export const REVEAL_LEVELS = ['hidden', 'unknown', 'named', 'full'] as const;
export type RevealLevel = (typeof REVEAL_LEVELS)[number];

/** One player's unlocks for one creature (a CreatureReveal row, normalized). */
export type PlayerReveal = { sections: RevealSection[]; full: boolean };
export const NO_REVEAL: PlayerReveal = Object.freeze({ sections: [], full: false }) as PlayerReveal;

// Sections the GM can unlock one at a time (at "unknown" or "named" level).
// "name" covers the creature's name (and portrait); the other card fields stay
// scrambled until "full".
export const REVEAL_SECTIONS = [
  'name',
  'defense',
  'offense',
  'statistics',
  'specialAbilities',
  'playerNotes',
  'wiki',
] as const;
export type RevealSection = (typeof REVEAL_SECTIONS)[number];

const SECTION_LABELS: Record<RevealSection, string> = {
  name: 'Name',
  defense: 'Defense',
  offense: 'Offense',
  statistics: 'Statistics',
  specialAbilities: 'Special Abilities',
  playerNotes: 'Player Notes',
  wiki: 'Wiki Page',
};

export function isRevealSection(v: unknown): v is RevealSection {
  return typeof v === 'string' && (REVEAL_SECTIONS as readonly string[]).includes(v);
}

/** A CreatureReveal row (or nothing) as a PlayerReveal; unknown section keys are dropped. */
export function normalizeReveal(row: { sections?: unknown; full?: unknown } | null | undefined): PlayerReveal {
  if (!row) return NO_REVEAL;
  const sections = Array.isArray(row.sections) ? [...new Set(row.sections.filter(isRevealSection))] : [];
  return { sections, full: row.full === true };
}

/**
 * The level one player sees: null when the creature is hidden from players,
 * else 'full' (everything unlocked), 'named' (name unlocked) or 'unknown'.
 */
export function playerRevealLevel(creatureLevel: unknown, reveal: PlayerReveal): Exclude<RevealLevel, 'hidden'> | null {
  if (creatureLevel === 'hidden' || !REVEAL_LEVELS.includes(creatureLevel as RevealLevel)) return null;
  if (reveal.full) return 'full';
  return reveal.sections.includes('name') ? 'named' : 'unknown';
}

export function revealSectionLabel(section: string): string {
  return (SECTION_LABELS as Record<string, string>)[section] ?? section;
}

// Creature keys readable when a section is unlocked ('name' and 'wiki' are
// handled specially: name gates the card name + portrait, wiki the wiki link).
const SECTION_FIELDS: Record<Exclude<RevealSection, 'wiki' | 'name'>, string[]> = {
  defense: ['acTotal', 'acTouch', 'acFlatFooted', 'hpMax', 'hpCurrent', 'hitDice', 'fort', 'ref', 'will'],
  offense: ['speed', 'attacks', 'spells'],
  statistics: ['str', 'dex', 'con', 'int', 'wis', 'cha', 'skills', 'feats', 'gear'],
  specialAbilities: ['specialAbilities'],
  playerNotes: ['playerNotes'],
};

// Mirrors lib/battle-map.ts: GM-only keys are never sent to players.
const GM_ONLY_KEYS = ['gmNotes', 'lootTableId', 'lootList', 'lootTable'] as const;

// Identity card fields. The name is its own unlockable section; the rest stay
// scrambled until "full".
const CARD_KEYS = ['name', 'type', 'subtype', 'size', 'cr', 'alignment'] as const;

/** Where clause for listing: players never see hidden creatures. */
export function creatureWhereFor(role: string, campaignId: string) {
  return role === 'dm' ? { campaignId } : { campaignId, revealLevel: { not: 'hidden' } };
}

// ---------------------------------------------------------------------------
// Server-side scrambling. Locked fields are replaced with runic filler — the
// real text NEVER leaves the server, so there is nothing to copy out or
// un-style. Strings get random runic filler of similar length (whitespace
// preserved); numbers are NEVER sent — every locked number becomes the same
// fixed 2-rune string, so no digits, signs, or magnitudes leak. Null stays
// null. Filler uses Runic Unicode glyphs so it renders in a runic style
// without any client font.
// ---------------------------------------------------------------------------

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Runic filler preserving length and whitespace. Seeded so it's stable per field. */
export function scrambleText(real: string, seed: string): string {
  if (!real) return real;
  const rand = mulberry32(hashSeed(seed));
  return [...real]
    .map((ch) => (/\s/.test(ch) ? ch : RUNES[Math.floor(rand() * RUNES.length)]))
    .join('');
}

/** Locked numbers are never sent: fixed 2-rune filler, no digits or magnitude. */
export const LOCKED_NUMBER_FILLER = 'ᚱᚢ';
function scrambleNumber(_n: number, _seed: string): string {
  return LOCKED_NUMBER_FILLER;
}

export function scrambleValue(v: unknown, seed: string): unknown {
  if (v == null) return v;
  if (typeof v === 'string') return scrambleText(v, seed);
  if (typeof v === 'number') return scrambleNumber(v, seed);
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((x, i) => scrambleValue(x, `${seed}:${i}`));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    // Keys containing digits (e.g. spells.slots spell levels) would leak real
    // numbers, so they become runic too (deduped to keep entries distinct).
    let i = 0;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      let key = /\d/.test(k) ? scrambleText(k, `${seed}:key:${i}`) : k;
      while (key in out) key += RUNES[i++ % RUNES.length];
      out[key] = scrambleValue(val, `${seed}:${k}`);
      i++;
    }
    return out;
  }
  return v;
}

type WikiRef = { id: string; title: string; visibility: string } | null | undefined;

export function asUnlocked(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : [];
}

/**
 * A creature as one viewer may see it, sanitized server-side.
 * GM: everything. Player: filtered by THAT player's own unlocks (`reveal`,
 * their CreatureReveal row; null = nothing unlocked). Required on purpose, so
 * every caller has to say whose unlocks apply.
 * - creature hidden from players: null (indistinguishable from missing)
 * - otherwise: sections (incl. "name", which also gates the portrait) readable
 *   only when that player unlocked them; everything else scrambled to runic
 *   filler; `full` makes everything readable except GM-only fields
 */
export async function presentCreature(
  c: Creature & { wikiPage?: WikiRef },
  role: string,
  reveal: PlayerReveal | null,
): Promise<Record<string, unknown> | null> {
  const portraitUrl = c.portraitPath ? await getFileUrl(c.portraitPath) : null;
  const pg = c.wikiPage;

  if (role === 'dm') {
    const { wikiPage: _w, ...rest } = c;
    return {
      ...rest,
      portraitUrl,
      wikiPage: pg ? { id: pg.id, title: pg.title } : null,
    };
  }

  const mine = normalizeReveal(reveal);
  const level = playerRevealLevel(c.revealLevel, mine);
  if (!level) return null;

  const seedBase = `${c.id}:${level}`;
  const rec = c as unknown as Record<string, unknown>;

  // This player's unlocks only; the creature's own unlockedSections column is
  // deprecated and never read. The name is readable at "full" or when "name"
  // is unlocked; other identity fields stay scrambled until "full".
  const unlocked: string[] = level === 'full' ? [...REVEAL_SECTIONS] : mine.sections;
  const shows = (section: RevealSection) => unlocked.includes(section);
  const nameReadable = level === 'full' || shows('name');
  const card: Record<string, unknown> = {
    id: c.id,
    campaignId: c.campaignId,
    revealLevel: level,
    unlockedSections: unlocked,
    isNpc: c.isNpc,
    portraitUrl: nameReadable ? portraitUrl : null,
    wikiPage: null,
  };
  for (const k of CARD_KEYS) {
    const v = (rec[k] as string) ?? '';
    if (k === 'name') {
      card[k] = nameReadable ? v : scrambleValue(v, `${seedBase}:name`);
    } else {
      card[k] = level === 'full' ? v : scrambleValue(v, `${seedBase}:${k}`);
    }
  }

  const field = (section: Exclude<RevealSection, 'wiki' | 'name'>, key: string): unknown => {
    const v = rec[key];
    return shows(section) ? v : scrambleValue(v, `${seedBase}:${key}`);
  };
  for (const section of REVEAL_SECTIONS) {
    if (section === 'wiki' || section === 'name') continue;
    const out: Record<string, unknown> = {};
    for (const k of SECTION_FIELDS[section]) out[k] = field(section, k);
    card[section] = out;
  }
  // Stat block "Special Attacks" / "SQ" lines live in specialAbilities (see statblock-import) but belong to
  // Offense / Statistics: never send them inside specialAbilities, and only expose them once that section shows.
  const lineFor = (re: RegExp) => (Array.isArray(rec.specialAbilities) ? rec.specialAbilities : [])
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && typeof (a as Record<string, unknown>).name === 'string' && re.test(String((a as Record<string, unknown>).name).trim()))
    .map((a) => (typeof a.description === 'string' ? a.description.trim() : '')).filter(Boolean).join('; ');
  const SA = /^special attacks$/i;
  const SQ = /^(sq|special qualities)$/i;
  const sa = card.specialAbilities as Record<string, unknown>;
  if (Array.isArray(sa.specialAbilities)) {
    // Filter by index against the raw list: when locked, the sent items are scrambled and can't be matched by name.
    const raw = Array.isArray(rec.specialAbilities) ? rec.specialAbilities : [];
    sa.specialAbilities = sa.specialAbilities.filter((_, i) => {
      const name = raw[i] && typeof raw[i] === 'object' ? (raw[i] as Record<string, unknown>).name : null;
      return !(typeof name === 'string' && (SA.test(name.trim()) || SQ.test(name.trim())));
    });
  }
  if (shows('offense')) (card.offense as Record<string, unknown>).specialAttacks = lineFor(SA);
  if (shows('statistics')) (card.statistics as Record<string, unknown>).specialQualities = lineFor(SQ);

  card.wikiPage = shows('wiki') && pg && pg.visibility === 'shared' ? { id: pg.id, title: pg.title } : null;

  for (const k of GM_ONLY_KEYS) delete card[k];
  return card;
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
  playerNotes: z.string().max(100_000),
  // Party-wide visibility only. 'named'/'full' are accepted from older clients
  // and stored as 'unknown': unlocks are per player now (CreatureReveal).
  revealLevel: z.enum(REVEAL_LEVELS).transform((v) => (v === 'hidden' ? 'hidden' : 'unknown')),
  // Deprecated party-wide unlocks: still accepted (stat block import drafts,
  // older clients) but never saved. Use /api/creatures/[id]/reveals.
  unlockedSections: z.array(z.string().max(40)).max(REVEAL_SECTIONS.length),
}).partial().strict().transform(({ unlockedSections: _ignored, ...rest }) => rest);

export type CreatureInput = z.infer<typeof creatureInputSchema>;

const sectionList = z.array(z.enum(REVEAL_SECTIONS)).max(REVEAL_SECTIONS.length);

/**
 * GM body for PUT /api/creatures/[id]/reveals, applied to each listed player:
 * `sections` replaces their unlocked sections, then `grant` adds and `revoke`
 * removes sections; `full` sets "everything". Omitted fields leave that
 * player's current value alone.
 */
export const revealUpdateSchema = z.object({
  userIds: z.array(z.string().min(1).max(100)).min(1).max(100),
  sections: sectionList.optional(),
  grant: sectionList.optional(),
  revoke: sectionList.optional(),
  full: z.boolean().optional(),
}).strict().refine(
  (v) => v.sections !== undefined || v.grant !== undefined || v.revoke !== undefined || v.full !== undefined,
  'sections, grant, revoke or full required',
);
export type RevealUpdate = z.infer<typeof revealUpdateSchema>;

/**
 * One player's unlocks after applying a GM update (see revealUpdateSchema).
 * Revoking a section from a player who has everything (full) leaves them every
 * other section, but no longer full.
 */
export function applyRevealUpdate(current: PlayerReveal, update: Omit<RevealUpdate, 'userIds'>): PlayerReveal {
  const revoking = (update.revoke?.length ?? 0) > 0;
  const fromFull = current.full && revoking && update.full === undefined && update.sections === undefined;
  const set = new Set<RevealSection>(update.sections ?? (fromFull ? REVEAL_SECTIONS : current.sections));
  for (const s of update.grant ?? []) set.add(s);
  for (const s of update.revoke ?? []) set.delete(s);
  return {
    sections: REVEAL_SECTIONS.filter((s) => set.has(s)),
    full: update.full ?? (fromFull ? false : current.full),
  };
}

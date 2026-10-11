// Shared helpers for Creature records (bestiary / NPC stat blocks).
import { z } from 'zod';
import type { Creature } from '@prisma/client';
import { getFileUrl } from '@/lib/s3';

// GM-set knowledge reveal levels, party-wide (not per player).
export const REVEAL_LEVELS = ['hidden', 'unknown', 'named', 'full'] as const;
export type RevealLevel = (typeof REVEAL_LEVELS)[number];

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
const GM_ONLY_KEYS = ['gmNotes'] as const;

// Identity card fields. The name is its own unlockable section; the rest stay
// scrambled until "full".
const CARD_KEYS = ['name', 'type', 'subtype', 'size', 'cr', 'alignment'] as const;

/** Where clause for listing: players never see hidden creatures. */
export function creatureWhereFor(role: string, campaignId: string) {
  return role === 'dm' ? { campaignId } : { campaignId, revealLevel: { not: 'hidden' } };
}

// ---------------------------------------------------------------------------
// Server-side scrambling. Locked fields are replaced with random filler of
// similar length — the real text NEVER leaves the server, so there is nothing
// to copy out or un-style. Filler uses Runic Unicode glyphs so it renders in a
// runic style without any client font.
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
function scrambleText(real: string, seed: string): string {
  if (!real) return real;
  const rand = mulberry32(hashSeed(seed));
  return [...real]
    .map((ch) => (/\s/.test(ch) ? ch : RUNES[Math.floor(rand() * RUNES.length)]))
    .join('');
}

/** Random number with the same digit count. */
function scrambleNumber(n: number, seed: string): number {
  if (!Number.isFinite(n)) return n;
  const digits = String(Math.abs(Math.trunc(n))).length || 1;
  const rand = mulberry32(hashSeed(seed));
  const min = digits <= 1 ? 0 : 10 ** (digits - 1);
  const v = min + Math.floor(rand() * (10 ** digits - min));
  return n < 0 ? -v : v;
}

function scrambleValue(v: unknown, seed: string): unknown {
  if (v == null) return v;
  if (typeof v === 'string') return scrambleText(v, seed);
  if (typeof v === 'number') return scrambleNumber(v, seed);
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) return v.map((x, i) => scrambleValue(x, `${seed}:${i}`));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = scrambleValue(val, `${seed}:${k}`);
    }
    return out;
  }
  return v;
}

type WikiRef = { id: string; title: string; visibility: string } | null | undefined;

function asUnlocked(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Player view of a creature, sanitized server-side.
 * - hidden: null (indistinguishable from missing for players)
 * - unknown: scrambled identity card, no portrait, no sections, no wiki
 * - named: readable card + portrait; sections readable only when unlocked,
 *   everything else scrambled to similar-length runic filler
 * - full: everything readable except gmNotes
 */
export async function presentCreature(
  c: Creature & { wikiPage?: WikiRef },
  role: string,
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

  const rawLevel = (c as unknown as Record<string, unknown>).revealLevel;
  const level: RevealLevel = REVEAL_LEVELS.includes(rawLevel as RevealLevel)
    ? (rawLevel as RevealLevel)
    : 'hidden';
  if (level === 'hidden') return null;

  const seedBase = `${c.id}:${level}`;
  const rec = c as unknown as Record<string, unknown>;

  // unknown | named | full. The name is readable at "full", at legacy
  // "named", or when the "name" section is unlocked; otherwise it is scrambled
  // like everything else. Other identity fields stay scrambled until "full".
  // Sections are unlockable at "unknown" and "named"; "unknown" just means
  // nothing is unlocked by default.
  const unlocked: string[] = level === 'full' ? [...REVEAL_SECTIONS] : asUnlocked(rec.unlockedSections);
  const shows = (section: RevealSection) => unlocked.includes(section);
  const nameReadable = level === 'full' || level === 'named' || shows('name');
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
  revealLevel: z.enum(REVEAL_LEVELS),
  unlockedSections: z.array(z.string().max(40)).max(REVEAL_SECTIONS.length),
}).partial().strict();

export type CreatureInput = z.infer<typeof creatureInputSchema>;

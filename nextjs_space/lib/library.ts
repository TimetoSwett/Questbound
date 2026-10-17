import { z } from 'zod';

// Shared site-wide library (spells first; feats/items/classes later).
// Pure helpers + DB helpers that take a Prisma-like client (so tests can mock
// it and the future AoN importer can pass a transaction).

export const LIBRARY_KINDS = ['spell', 'rule', 'weapon', 'armor', 'gear', 'feat', 'ability'] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];
export const LIBRARY_SYSTEMS = ['pf1e', 'dnd35'] as const;
export type LibrarySystem = (typeof LIBRARY_SYSTEMS)[number];
export const LIBRARY_SOURCES = ['user', 'aon'] as const;
export type LibrarySource = (typeof LIBRARY_SOURCES)[number];

export const SUMMARY_MAX = 120;
export const NAME_MAX = 120;
export const MAX_BODY_BYTES = 64 * 1024;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;

/** Lowercase, trim, collapse internal whitespace. */
/** Lowercase, trim, collapse internal whitespace; drops invisible format chars (zero-width, bidi). */
export function normalizeNameKey(name: string): string {
  return String(name ?? '').normalize('NFKC').replace(/\p{Cf}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Escape LIKE wildcards so Prisma startsWith/contains match literally (PostgreSQL default escape is backslash). */
export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** One short line: strip newlines/control chars, collapse spaces, cap at SUMMARY_MAX. */
export function sanitizeSummary(text: unknown, max = SUMMARY_MAX): string {
  const s = String(text ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}

/** Default summary from a description: its first sentence, sanitized. */
export function summaryFromDescription(description: unknown): string {
  const flat = sanitizeSummary(description, 10_000);
  const m = /^(.+?[.!?])(\s|$)/.exec(flat);
  return sanitizeSummary(m ? m[1] : flat);
}

const str = (max: number) => z.string().trim().max(max).default('');

export const spellDataSchema = z.object({
  school: str(40),
  subschool: str(60),
  descriptors: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  castingTime: str(100),
  components: str(300),
  range: str(150),
  areaTargetEffect: str(400),
  duration: str(150),
  savingThrow: str(200),
  spellResistance: str(100),
  description: str(20_000),
}).strict();
export type SpellData = z.infer<typeof spellDataSchema>;

// Rules (e.g. AoN Universal Monster Rules). Plain text only; no SpellLevel rows.
export const RULE_CATEGORIES = ['universal-monster-rule'] as const; // extensible
export const ALIAS_MAX = 80;
export const ALIASES_MAX_COUNT = 10;
export const ruleDataSchema = z.object({
  category: z.enum(RULE_CATEGORIES).default('universal-monster-rule'),
  format: str(300),
  text: str(20_000),
  // Stored normalized like nameKey (so lookups/terms can match them directly); deduped.
  aliases: z.array(z.string().max(ALIAS_MAX).refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'Alias has control characters')
    .transform(normalizeNameKey).refine((s) => s.length > 0, 'Alias required')).max(ALIASES_MAX_COUNT).default([])
    .transform((a) => [...new Set(a)]),
}).strict();
export type RuleData = z.infer<typeof ruleDataSchema>;

export const WEAPON_CATEGORIES = ['melee', 'ranged', 'thrown', 'composite'] as const;
export const WEAPON_HANDS = ['one', 'two', 'off'] as const;
const pounds = z.number().min(0).max(100_000).default(0);
const cost = str(120);
export const weaponDataSchema = z.object({
  category: z.enum(WEAPON_CATEGORIES).default('melee'),
  hands: z.enum(WEAPON_HANDS).optional(),
  ability: z.enum(['str', 'dex']).default('str'),
  damage: str(40),
  crit: str(40),
  range: z.number().int().min(0).max(100_000).default(0),
  type: str(40),
  weight: pounds,
  cost,
  description: str(20_000),
}).strict();
export type WeaponData = z.infer<typeof weaponDataSchema>;

export const armorDataSchema = z.object({
  slot: z.enum(['armor', 'shield']).default('armor'),
  acBonus: z.number().int().min(-100).max(100).default(0),
  maxDex: z.number().int().min(-100).max(100).nullable().default(null),
  checkPenalty: z.number().int().min(-100).max(0).default(0),
  spellFailure: z.number().int().min(0).max(100).default(0),
  weight: pounds,
  cost,
  description: str(20_000),
}).strict();
export type ArmorData = z.infer<typeof armorDataSchema>;

export const gearDataSchema = z.object({
  weight: pounds,
  cost,
  description: str(20_000),
}).strict();
export type GearData = z.infer<typeof gearDataSchema>;

export const featDataSchema = z.object({
  featType: str(80),
  prerequisites: str(500),
  benefit: str(4_000),
  description: str(20_000),
}).strict();
export type FeatData = z.infer<typeof featDataSchema>;

export const abilityDataSchema = z.object({
  description: str(20_000),
}).strict();
export type AbilityData = z.infer<typeof abilityDataSchema>;

export const dataSchemas: Record<LibraryKind, z.ZodTypeAny> = {
  spell: spellDataSchema, rule: ruleDataSchema, weapon: weaponDataSchema, armor: armorDataSchema,
  gear: gearDataSchema, feat: featDataSchema, ability: abilityDataSchema,
};

/** Long text of an entry's data (spell description / rule text), for default summaries. */
export function dataLongText(d: unknown): unknown {
  const o = (d ?? {}) as { description?: unknown; text?: unknown };
  return o.description ?? o.text;
}

export const spellLevelsSchema = z.array(z.object({
  cls: z.string().trim().toLowerCase().min(1).max(40).regex(/^[a-z0-9][a-z0-9 /'()-]*$/, 'Invalid class name'),
  level: z.number().int().min(0).max(9),
}).strict()).max(40).default([])
  .refine((a) => new Set(a.map((x) => x.cls)).size === a.length, 'Duplicate class in spellLevels');

const nameSchema = z.string().trim().min(1).max(NAME_MAX).refine((s) => !/[\u0000-\u001f\u007f]/.test(s), 'Name has control characters').refine((s) => normalizeNameKey(s).length > 0, 'Name required');
const urlSchema = z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'http(s) URL required');

export const createInputSchema = z.object({
  kind: z.enum(LIBRARY_KINDS),
  system: z.enum(LIBRARY_SYSTEMS).default('pf1e'),
  name: nameSchema,
  summary: z.string().max(2000).optional(),
  sourceUrl: urlSchema.nullable().optional(),
  data: z.unknown(),
  spellLevels: spellLevelsSchema.optional(),
}).strict();

export const patchInputSchema = z.object({
  name: nameSchema.optional(),
  system: z.enum(LIBRARY_SYSTEMS).optional(),
  summary: z.string().max(2000).optional(),
  sourceUrl: urlSchema.nullable().optional(),
  data: z.unknown().optional(),
  spellLevels: spellLevelsSchema.optional(),
}).strict();

export type ParsedEntryInput = {
  kind: LibraryKind; system: LibrarySystem; name: string; nameKey: string; summary: string;
  sourceUrl: string | null; data: Record<string, unknown>; spellLevels: Array<{ cls: string; level: number }>;
};

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string; issues?: z.ZodIssue[] };

/** Validate a create body. Kind-specific `data` validated by its schema. */
export function parseCreateInput(body: unknown): Ok<ParsedEntryInput> | Err {
  const base = createInputSchema.safeParse(body);
  if (!base.success) return { ok: false, error: 'Invalid library entry', issues: base.error.issues };
  const data = dataSchemas[base.data.kind].safeParse(base.data.data ?? {});
  if (!data.success) return { ok: false, error: 'Invalid entry data', issues: data.error.issues };
  const d = data.data as Record<string, unknown>;
  const levels = base.data.kind === 'spell' ? (base.data.spellLevels ?? []) : [];
  return {
    ok: true,
    value: {
      kind: base.data.kind, system: base.data.system, name: base.data.name, nameKey: normalizeNameKey(base.data.name),
      summary: base.data.summary !== undefined && base.data.summary.trim() ? sanitizeSummary(base.data.summary) : summaryFromDescription(dataLongText(d)),
      sourceUrl: base.data.sourceUrl ?? null, data: d, spellLevels: levels,
    },
  };
}

export type ParsedPatch = Partial<Omit<ParsedEntryInput, 'kind'>>;
export function parsePatchInput(kind: string, body: unknown): Ok<ParsedPatch> | Err {
  const base = patchInputSchema.safeParse(body);
  if (!base.success) return { ok: false, error: 'Invalid library entry', issues: base.error.issues };
  const out: ParsedPatch = {};
  const b = base.data;
  if (b.name !== undefined) { out.name = b.name; out.nameKey = normalizeNameKey(b.name); }
  if (b.system !== undefined) out.system = b.system;
  if (b.summary !== undefined) out.summary = sanitizeSummary(b.summary);
  if (b.sourceUrl !== undefined) out.sourceUrl = b.sourceUrl;
  if (b.data !== undefined) {
    const schema = dataSchemas[kind as LibraryKind];
    if (!schema) return { ok: false, error: 'Unknown kind' };
    const d = schema.safeParse(b.data);
    if (!d.success) return { ok: false, error: 'Invalid entry data', issues: d.error.issues };
    out.data = d.data as Record<string, unknown>;
  }
  if (b.spellLevels !== undefined) {
    if (kind !== 'spell') return { ok: false, error: 'spellLevels only apply to spells' };
    out.spellLevels = b.spellLevels;
  }
  return { ok: true, value: out };
}

// ---- permissions ----
export type LibraryActor = { id: string; isAdmin: boolean } | null;
type PermEntry = { createdById: string | null; source: string; kind?: string };

/** Any logged-in user may create spells; rules (which drive site-wide term lookup) are admin-only. */
export function canCreateEntry(actor: LibraryActor, kind?: string): boolean {
  if (!actor?.id) return false;
  return kind === 'rule' ? actor.isAdmin : true;
}
/** True if a raw PATCH body asks to set kind='rule' (checked before schema validation, which rejects `kind`). */
export function patchRequestsRuleKind(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const k = (body as { kind?: unknown }).kind;
  return typeof k === 'string' && k.trim().toLowerCase() === 'rule';
}
/** Edit/delete: admins always; rules are admin-only; AoN entries otherwise read-only; else only the creator. */
export function canEditEntry(actor: LibraryActor, entry: PermEntry): boolean {
  if (!actor?.id) return false;
  if (actor.isAdmin) return true;
  if (entry.kind === 'rule') return false;
  if (entry.source === 'aon') return false;
  return !!entry.createdById && entry.createdById === actor.id;
}
export const canDeleteEntry = canEditEntry;

// ---- presenter ----
export type LibraryEntryRow = {
  id: string; kind: string; name: string; nameKey: string; system: string; source: string; sourceUrl: string | null;
  matchedAon: boolean; summary: string; data: unknown; createdById: string | null; createdAt: Date | string; updatedAt: Date | string;
  spellLevels?: Array<{ cls: string; level: number }>;
};
export function presentEntry(row: LibraryEntryRow, actor: LibraryActor = null, opts: { includeData?: boolean } = {}) {
  const levels = (row.spellLevels ?? []).map(({ cls, level }) => ({ cls, level })).sort((a, b) => a.level - b.level || a.cls.localeCompare(b.cls));
  return {
    id: row.id, kind: row.kind, name: row.name, system: row.system, source: row.source, sourceUrl: row.sourceUrl,
    matchedAon: row.matchedAon, summary: row.summary, spellLevels: levels,
    ...(opts.includeData === false ? {} : { data: row.data }),
    createdById: row.createdById,
    canEdit: canEditEntry(actor, row),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

// ---- search ----
/** Blank query params become "no filter". Stored spell facets are lowercase. */
const facet = (max: number) => z.string().trim().toLowerCase().max(max).optional().transform((value) => value || undefined);

export const searchQuerySchema = z.object({
  kind: z.enum(LIBRARY_KINDS).default('spell'),
  system: z.enum(LIBRARY_SYSTEMS).default('pf1e'),
  q: z.string().max(NAME_MAX).optional().default(''),
  cls: z.string().trim().toLowerCase().max(40).optional(),
  level: z.coerce.number().int().min(0).max(9).optional(),
  slot: z.enum(['armor', 'shield']).optional(),
  school: facet(40),
  subschool: facet(60),
  descriptor: facet(40),
  duration: facet(80),
  range: facet(80),
  limit: z.coerce.number().int().min(1).max(SEARCH_MAX_LIMIT).default(SEARCH_DEFAULT_LIMIT),
  page: z.coerce.number().int().min(1).max(500).default(1),
}).strip();
export type SearchQuery = z.infer<typeof searchQuerySchema>;

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];

/**
 * Alternate nameKey for numbered spells (AoN stores 'summon monster 1', users type 'summon monster i').
 * Only for 2+ word keys, only the LAST word, only exact roman i..x <-> digit 1..10. Otherwise null.
 */
export function numeralAltKey(key: string): string | null {
  const words = key.split(' ');
  if (words.length < 2) return null;
  const last = words[words.length - 1];
  const ri = ROMAN.indexOf(last);
  let alt: string | null = null;
  if (ri >= 0) alt = String(ri + 1);
  else if (/^(?:[1-9]|10)$/.test(last)) alt = ROMAN[Number(last) - 1];
  if (alt === null) return null;
  return [...words.slice(0, -1), alt].join(' ');
}

/** Exact matches (key or numeral alternate) first, then prefix matches, then other contains-matches; each block alphabetical by nameKey. */
export function orderSearchResults<T extends { nameKey: string }>(rows: T[], q: string, limit: number): T[] {
  const key = normalizeNameKey(q);
  const alt = numeralAltKey(key);
  const isExact = (r: T) => Boolean(key) && (r.nameKey === key || (alt !== null && r.nameKey === alt));
  const isPrefix = (r: T) => r.nameKey.startsWith(key) || (alt !== null && r.nameKey.startsWith(alt));
  const seen = new Set<T>();
  const uniq = rows.filter((r) => (seen.has(r) ? false : (seen.add(r), true)));
  const byKey = (a: T, b: T) => (a.nameKey < b.nameKey ? -1 : a.nameKey > b.nameKey ? 1 : 0);
  const exact = uniq.filter(isExact).sort(byKey);
  const prefix = uniq.filter((r) => !isExact(r) && isPrefix(r)).sort(byKey);
  const rest = uniq.filter((r) => !isExact(r) && !isPrefix(r)).sort(byKey);
  return [...exact, ...prefix, ...rest].slice(0, limit);
}

// Minimal structural Prisma client type so callers can pass prisma or a tx.
type Db = { libraryEntry: any; spellLevel: any; $transaction?: any };

export function searchWhere(query: SearchQuery) {
  const key = normalizeNameKey(query.q);
  const levelFilter = query.cls || query.level !== undefined
    ? { spellLevels: { some: { ...(query.cls ? { cls: query.cls } : {}), ...(query.level !== undefined ? { level: query.level } : {}) } } }
    : {};
  // Spell stats live in data JSON. School is exact; subschool/duration/range are substrings
  // (subschool can be "healing, creation"; range is "medium (100 ft. + 10 ft./level)").
  const dataFilters = [
    ...(query.kind === 'spell' ? [
      query.school ? { data: { path: ['school'], equals: query.school } } : null,
      query.subschool ? { data: { path: ['subschool'], string_contains: query.subschool } } : null,
      query.descriptor ? { data: { path: ['descriptors'], array_contains: [query.descriptor] } } : null,
      query.duration ? { data: { path: ['duration'], string_contains: query.duration } } : null,
      query.range ? { data: { path: ['range'], string_contains: query.range } } : null,
    ] : []),
    query.kind === 'armor' && query.slot ? { data: { path: ['slot'], equals: query.slot } } : null,
  ].filter((filter): filter is NonNullable<typeof filter> => filter !== null);
  return { key, base: { kind: query.kind, system: query.system, ...levelFilter, ...(dataFilters.length ? { AND: dataFilters } : {}) } };
}

export async function searchLibrary(db: Db, query: SearchQuery) {
  return (await searchLibraryPage(db, query)).results;
}

/** One page of matches, in the same order as searchLibrary, plus the total match count. */
export async function searchLibraryPage(db: Db, query: SearchQuery): Promise<{ results: LibraryEntryRow[]; total: number }> {
  const { key, base } = searchWhere(query);
  const keys = [key, numeralAltKey(key)].filter((k): k is string => k !== null);
  const likes = keys.map(escapeLike);
  const anyOf = (op: 'startsWith' | 'contains') => (likes.length === 1 ? { nameKey: { [op]: likes[0] } } : { OR: likes.map((l) => ({ nameKey: { [op]: l } })) });
  const include = { spellLevels: { select: { cls: true, level: true } } };
  const select = { id: true, kind: true, name: true, nameKey: true, system: true, source: true, sourceUrl: true, matchedAon: true, summary: true, createdById: true, createdAt: true, updatedAt: true, ...include };
  // Exact name matches, then prefix matches, then other contains-matches. Each block is alphabetical.
  const exactWhere = key ? { ...base, nameKey: { in: keys } } : null;
  const prefixWhere = { AND: [base, anyOf('startsWith'), ...(key ? [{ nameKey: { notIn: keys } }] : [])] };
  const containsWhere = key ? { AND: [base, anyOf('contains'), { NOT: anyOf('startsWith') }] } : null;
  const buckets = [
    exactWhere ? { where: exactWhere } : null,
    { where: prefixWhere },
    containsWhere ? { where: containsWhere } : null,
  ].filter((bucket): bucket is NonNullable<typeof bucket> => bucket !== null);
  const counts = await Promise.all(buckets.map((bucket) => db.libraryEntry.count({ where: bucket.where })));
  const total = counts.reduce((sum: number, count: number) => sum + count, 0);
  let skip = (query.page - 1) * query.limit;
  let take = query.limit;
  const parts: LibraryEntryRow[] = [];
  for (let i = 0; i < buckets.length && take > 0; i++) {
    const count = counts[i];
    if (skip >= count) { skip -= count; continue; }
    const n = Math.min(take, count - skip);
    parts.push(...await db.libraryEntry.findMany({ where: buckets[i].where, orderBy: { nameKey: 'asc' }, skip, take: n, select }));
    take -= n;
    skip = 0;
  }
  return { results: orderSearchResults(parts, key, query.limit), total };
}

// ---- importer upsert ----
export type UpsertInput = Omit<ParsedEntryInput, 'nameKey'> & { nameKey?: string };
export type UpsertResult = { action: 'created' | 'matched' | 'updated'; id: string };

/**
 * Upsert for the (future) AoN importer, matched by kind+system+nameKey.
 * - none: create as source="aon".
 * - existing user entry: only set sourceUrl + matchedAon=true; user fields untouched.
 * - existing aon entry: update all fields and replace spellLevels.
 */
export async function upsertLibraryEntry(db: Db, input: UpsertInput): Promise<UpsertResult> {
  const nameKey = input.nameKey ?? normalizeNameKey(input.name);
  const summary = input.summary ? sanitizeSummary(input.summary) : summaryFromDescription(dataLongText(input.data));
  const run = async (tx: Db): Promise<UpsertResult> => {
    const existing = await tx.libraryEntry.findUnique({ where: { kind_system_nameKey: { kind: input.kind, system: input.system, nameKey } }, select: { id: true, source: true } });
    const levels = input.kind === 'spell' ? input.spellLevels ?? [] : [];
    if (!existing) {
      const created = await tx.libraryEntry.create({
        data: { kind: input.kind, system: input.system, name: input.name, nameKey, source: 'aon', sourceUrl: input.sourceUrl ?? null, summary, data: input.data, spellLevels: { create: levels } },
        select: { id: true },
      });
      return { action: 'created', id: created.id };
    }
    if (existing.source !== 'aon') {
      await tx.libraryEntry.update({ where: { id: existing.id }, data: { sourceUrl: input.sourceUrl ?? null, matchedAon: true } });
      return { action: 'matched', id: existing.id };
    }
    await tx.spellLevel.deleteMany({ where: { entryId: existing.id } });
    await tx.libraryEntry.update({
      where: { id: existing.id },
      data: { name: input.name, sourceUrl: input.sourceUrl ?? null, summary, data: input.data, spellLevels: { create: levels } },
    });
    return { action: 'updated', id: existing.id };
  };
  return typeof db.$transaction === 'function' ? db.$transaction((tx: Db) => run(tx)) : run(db);
}

// ---- terms + batch lookup (rules first; any kind) ----
export const LOOKUP_MAX_TERMS = 50;
export const LOOKUP_TERM_MAX = 80;

export const termsQuerySchema = z.object({
  kind: z.enum(LIBRARY_KINDS).optional(),
  system: z.enum(LIBRARY_SYSTEMS).default('pf1e'),
}).strip();
export type TermsQuery = z.infer<typeof termsQuerySchema>;

export const lookupInputSchema = z.object({
  terms: z.array(z.string().max(LOOKUP_TERM_MAX)).max(LOOKUP_MAX_TERMS),
  kind: z.enum(LIBRARY_KINDS).optional(),
  system: z.enum(LIBRARY_SYSTEMS).optional(),
}).strict();

const aliasesOf = (data: unknown): string[] => {
  const a = (data as { aliases?: unknown } | null)?.aliases;
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string').map(normalizeNameKey).filter(Boolean) : [];
};

export type TermRow = { term: string; entryId: string; kind: string };
/**
 * One row per term (normalized name and aliases). When a term is shared the AoN entry wins,
 * then name over alias, then lowest id. Longest term first, then alphabetical.
 */
export function buildTerms(rows: Array<{ id: string; kind: string; nameKey: string; source?: string; data: unknown }>): TermRow[] {
  const best = new Map<string, { row: TermRow; score: string }>();
  for (const r of rows) {
    const nameTerm = normalizeNameKey(r.nameKey);
    for (const term of new Set([nameTerm, ...aliasesOf(r.data)])) {
      if (!term) continue;
      const score = `${r.source === 'aon' ? 0 : 1}|${term === nameTerm ? 0 : 1}|${r.id}`;
      const cur = best.get(term);
      if (!cur || score < cur.score) best.set(term, { row: { term, entryId: r.id, kind: r.kind }, score });
    }
  }
  return [...best.values()].map((v) => v.row).sort((a, b) => b.term.length - a.term.length || (a.term < b.term ? -1 : a.term > b.term ? 1 : 0));
}

export function termsEtag(q: TermsQuery, count: number, maxUpdatedAt: Date | string | null): string {
  const t = maxUpdatedAt ? new Date(maxUpdatedAt).getTime() : 0;
  return `W/"terms-${q.kind ?? 'all'}-${q.system}-${count}-${t}"`;
}

/** If-None-Match match (comma lists, weak compare, "*"). */
export function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false;
  const strip = (s: string) => s.trim().replace(/^W\//, '');
  return header.split(',').some((h) => h.trim() === '*' || strip(h) === strip(etag));
}

export async function listTerms(db: Db, q: TermsQuery) {
  const where = { system: q.system, ...(q.kind ? { kind: q.kind } : {}) };
  const agg = await db.libraryEntry.aggregate({ where, _count: { _all: true }, _max: { updatedAt: true } });
  const etag = termsEtag(q, agg._count._all, agg._max.updatedAt);
  return {
    etag,
    load: async () => buildTerms(await db.libraryEntry.findMany({ where, select: { id: true, kind: true, nameKey: true, source: true, data: true }, orderBy: { id: 'asc' } })),
  };
}

export type LookupMatch = { id: string; name: string; kind: string; summary: string; sourceUrl: string | null };
type LookupRow = LookupMatch & { nameKey: string; system: string; source: string; data: unknown };

/** Batch lookup: 2 queries total (nameKey IN keys, alias contains any key). Results in input order; AoN beats user, name beats alias, then pf1e, kind, id. */
export async function lookupTerms(db: Db, input: z.infer<typeof lookupInputSchema>): Promise<Array<{ term: string; match: LookupMatch | null }>> {
  const keys = input.terms.map(normalizeNameKey);
  const uniq = [...new Set(keys.filter(Boolean))];
  const base = { ...(input.kind ? { kind: input.kind } : {}), ...(input.system ? { system: input.system } : {}) };
  const select = { id: true, name: true, kind: true, summary: true, sourceUrl: true, nameKey: true, system: true, source: true, data: true };
  let byName: LookupRow[] = [];
  let byAlias: LookupRow[] = [];
  if (uniq.length) {
    byName = await db.libraryEntry.findMany({ where: { ...base, nameKey: { in: uniq } }, select });
    byAlias = await db.libraryEntry.findMany({ where: { ...base, OR: uniq.map((k) => ({ data: { path: ['aliases'], array_contains: [k] } })) }, select });
  }
  const rank = (r: LookupRow) => `${r.system === 'pf1e' ? 0 : 1}|${r.kind}|${r.id}`;
  const srcRank = (r: LookupRow) => (r.source === 'aon' ? 0 : 1);
  const best = new Map<string, { r: LookupRow; score: string }>();
  const offer = (k: string, r: LookupRow, tier: number) => {
    const score = `${srcRank(r)}|${tier}|${rank(r)}`;
    const cur = best.get(k);
    if (!cur || score < cur.score) best.set(k, { r, score });
  };
  for (const r of byName) offer(r.nameKey, r, 0);
  const want = new Set(uniq);
  for (const r of byAlias) for (const a of aliasesOf(r.data)) if (want.has(a)) offer(a, r, 1);
  return input.terms.map((term, i) => {
    const b = best.get(keys[i]);
    return { term, match: b ? { id: b.r.id, name: b.r.name, kind: b.r.kind, summary: b.r.summary, sourceUrl: b.r.sourceUrl } : null };
  });
}

/** Ids referenced by sheet JSON. Used to drop links that don't point at a real library row. */
export function libraryIdsIn(value: unknown): string[] {
  const ids: string[] = [];
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    const rec = v as Record<string, unknown>;
    if (typeof rec.libraryEntryId === 'string' && rec.libraryEntryId) ids.push(rec.libraryEntryId);
    for (const child of Object.values(rec)) walk(child);
  };
  walk(value);
  return [...new Set(ids)];
}

export function stripMissingLibraryIds(value: unknown, existing: Set<string>): void {
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { v.forEach(walk); return; }
    const rec = v as Record<string, unknown>;
    if ('libraryEntryId' in rec && (typeof rec.libraryEntryId !== 'string' || !existing.has(rec.libraryEntryId))) delete rec.libraryEntryId;
    for (const child of Object.values(rec)) walk(child);
  };
  walk(value);
}

import { z } from 'zod';

// Shared site-wide library (spells first; feats/items/classes later).
// Pure helpers + DB helpers that take a Prisma-like client (so tests can mock
// it and the future AoN importer can pass a transaction).

export const LIBRARY_KINDS = ['spell'] as const;
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
export function normalizeNameKey(name: string): string {
  return String(name ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
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

export const dataSchemas: Record<LibraryKind, z.ZodTypeAny> = { spell: spellDataSchema };

export const spellLevelsSchema = z.array(z.object({
  cls: z.string().trim().toLowerCase().min(1).max(40).regex(/^[a-z0-9][a-z0-9 /'()-]*$/, 'Invalid class name'),
  level: z.number().int().min(0).max(9),
}).strict()).max(40).default([])
  .refine((a) => new Set(a.map((x) => x.cls)).size === a.length, 'Duplicate class in spellLevels');

const nameSchema = z.string().trim().min(1).max(NAME_MAX).refine((s) => normalizeNameKey(s).length > 0, 'Name required');
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
      summary: base.data.summary !== undefined && base.data.summary.trim() ? sanitizeSummary(base.data.summary) : summaryFromDescription(d.description),
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
type PermEntry = { createdById: string | null; source: string };

export function canCreateEntry(actor: LibraryActor): boolean { return !!actor?.id; }
/** Edit/delete: admins always; AoN entries otherwise read-only; else only the creator. */
export function canEditEntry(actor: LibraryActor, entry: PermEntry): boolean {
  if (!actor?.id) return false;
  if (actor.isAdmin) return true;
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
export const searchQuerySchema = z.object({
  kind: z.enum(LIBRARY_KINDS).default('spell'),
  system: z.enum(LIBRARY_SYSTEMS).default('pf1e'),
  q: z.string().max(NAME_MAX).optional().default(''),
  cls: z.string().trim().toLowerCase().max(40).optional(),
  level: z.coerce.number().int().min(0).max(9).optional(),
  limit: z.coerce.number().int().min(1).max(SEARCH_MAX_LIMIT).default(SEARCH_DEFAULT_LIMIT),
}).strip();
export type SearchQuery = z.infer<typeof searchQuerySchema>;

/** Prefix matches first, then other contains-matches; each block alphabetical by nameKey. */
export function orderSearchResults<T extends { nameKey: string }>(rows: T[], q: string, limit: number): T[] {
  const key = normalizeNameKey(q);
  const seen = new Set<T>();
  const uniq = rows.filter((r) => (seen.has(r) ? false : (seen.add(r), true)));
  const byKey = (a: T, b: T) => (a.nameKey < b.nameKey ? -1 : a.nameKey > b.nameKey ? 1 : 0);
  const prefix = uniq.filter((r) => r.nameKey.startsWith(key)).sort(byKey);
  const rest = uniq.filter((r) => !r.nameKey.startsWith(key)).sort(byKey);
  return [...prefix, ...rest].slice(0, limit);
}

// Minimal structural Prisma client type so callers can pass prisma or a tx.
type Db = { libraryEntry: any; spellLevel: any; $transaction?: any };

export function searchWhere(query: SearchQuery) {
  const key = normalizeNameKey(query.q);
  const levelFilter = query.cls || query.level !== undefined
    ? { spellLevels: { some: { ...(query.cls ? { cls: query.cls } : {}), ...(query.level !== undefined ? { level: query.level } : {}) } } }
    : {};
  return { key, base: { kind: query.kind, system: query.system, ...levelFilter } };
}

export async function searchLibrary(db: Db, query: SearchQuery) {
  const { key, base } = searchWhere(query);
  const include = { spellLevels: { select: { cls: true, level: true } } };
  const select = { id: true, kind: true, name: true, nameKey: true, system: true, source: true, sourceUrl: true, matchedAon: true, summary: true, createdById: true, createdAt: true, updatedAt: true, ...include };
  const prefix = await db.libraryEntry.findMany({ where: { ...base, nameKey: { startsWith: key } }, orderBy: { nameKey: 'asc' }, take: query.limit, select });
  let rest: LibraryEntryRow[] = [];
  if (key && prefix.length < query.limit) {
    rest = await db.libraryEntry.findMany({
      where: { ...base, nameKey: { contains: key }, NOT: { nameKey: { startsWith: key } } },
      orderBy: { nameKey: 'asc' }, take: query.limit - prefix.length, select,
    });
  }
  return orderSearchResults([...prefix, ...rest] as LibraryEntryRow[], key, query.limit);
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
  const summary = input.summary ? sanitizeSummary(input.summary) : summaryFromDescription((input.data as any)?.description);
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

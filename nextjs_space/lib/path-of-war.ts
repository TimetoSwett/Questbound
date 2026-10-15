import { z } from 'zod';

export const INITIATION_ABILITIES = ['int', 'wis', 'cha'] as const;
export type InitiationAbility = (typeof INITIATION_ABILITIES)[number];
export const MANEUVER_TYPES = ['strike', 'boost', 'counter', 'other'] as const;
export type ManeuverType = (typeof MANEUVER_TYPES)[number];
export const MAX_MANEUVERS = 200;
export const MAX_STANCES = 50;
export const MAX_DISCIPLINES = 30;

export interface Maneuver {
  id: string; name: string; discipline: string; level: number; type: ManeuverType;
  action: string; range: string; target: string; duration: string; save: string; description: string;
  readied: boolean; expended: boolean;
}
export interface Stance { id: string; name: string; discipline: string; level: number; description: string }
export interface PathOfWarLimits { maneuversKnown: number; maneuversReadied: number; stancesKnown: number }
export interface PathOfWarData {
  initiatorLevel: number; initiationAbility: InitiationAbility; disciplines: string[];
  maneuvers: Maneuver[]; stances: Stance[]; activeStanceId: string | null; limits: PathOfWarLimits;
}

const int = (min: number, max: number, fallback = 0) =>
  z.preprocess(v => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.trunc(v))) : fallback), z.number().int().min(min).max(max));
const text = (max: number) =>
  z.preprocess(v => (typeof v === 'string' ? v.slice(0, max) : ''), z.string().max(max));
const flag = z.preprocess(v => v === true, z.boolean());
const idField = z.preprocess(v => (typeof v === 'string' ? v.slice(0, 100) : ''), z.string().min(1).max(100));

export const maneuverSchema = z.object({
  id: idField, name: text(100), discipline: text(40), level: int(1, 9, 1),
  type: z.preprocess(v => (MANEUVER_TYPES.includes(v as ManeuverType) ? v : 'other'), z.enum(MANEUVER_TYPES)),
  action: text(100), range: text(100), target: text(200), duration: text(100), save: text(100), description: text(10000),
  readied: flag, expended: flag,
});
export const stanceSchema = z.object({ id: idField, name: text(100), discipline: text(40), level: int(1, 9, 1), description: text(10000) });
export const limitsSchema = z.object({ maneuversKnown: int(0, 1000), maneuversReadied: int(0, 1000), stancesKnown: int(0, 1000) });

export function defaultPathOfWar(): PathOfWarData {
  return {
    initiatorLevel: 0, initiationAbility: 'int', disciplines: [], maneuvers: [], stances: [], activeStanceId: null,
    limits: { maneuversKnown: 0, maneuversReadied: 0, stancesKnown: 0 },
  };
}

function parseList<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, raw: unknown, max: number): T[] {
  const out: T[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    if (out.length >= max) break;
    const parsed = schema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Coerces anything into valid, clamped Path of War data (invalid entries dropped, lists capped). */
export function normalizePathOfWar(raw: unknown): PathOfWarData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultPathOfWar();
  const rec = raw as Record<string, unknown>;
  const disciplines: string[] = [];
  for (const d of Array.isArray(rec.disciplines) ? rec.disciplines : []) {
    if (disciplines.length >= MAX_DISCIPLINES) break;
    if (typeof d === 'string') disciplines.push(d.slice(0, 40));
  }
  const maneuvers = parseList(maneuverSchema, rec.maneuvers, MAX_MANEUVERS);
  const stances = parseList(stanceSchema, rec.stances, MAX_STANCES);
  const active = typeof rec.activeStanceId === 'string' && stances.some(s => s.id === rec.activeStanceId) ? rec.activeStanceId : null;
  const limits = limitsSchema.parse(rec.limits && typeof rec.limits === 'object' ? rec.limits : {});
  return {
    initiatorLevel: int(0, 40).parse(rec.initiatorLevel),
    initiationAbility: z.preprocess(v => (INITIATION_ABILITIES.includes(v as InitiationAbility) ? v : 'int'), z.enum(INITIATION_ABILITIES)).parse(rec.initiationAbility),
    disciplines, maneuvers, stances, activeStanceId: active, limits,
  };
}

/** Sanitizes only the `pathOfWar` key of a spells object (returns a copy); other keys pass through. */
export function sanitizeSpellsPathOfWar<T>(spells: T): T {
  if (!spells || typeof spells !== 'object' || Array.isArray(spells)) return spells;
  if (!Object.prototype.hasOwnProperty.call(spells, 'pathOfWar')) return spells;
  return { ...spells, pathOfWar: normalizePathOfWar((spells as Record<string, unknown>).pathOfWar) };
}

/** Clears expended on every maneuver (readied is kept). */
export function recoverAll(data: PathOfWarData): PathOfWarData {
  return { ...data, maneuvers: data.maneuvers.map(m => (m.expended ? { ...m, expended: false } : m)) };
}

export function toggleReadied(data: PathOfWarData, id: string): PathOfWarData {
  return { ...data, maneuvers: data.maneuvers.map(m => (m.id === id ? { ...m, readied: !m.readied } : m)) };
}

export function toggleExpended(data: PathOfWarData, id: string): PathOfWarData {
  return { ...data, maneuvers: data.maneuvers.map(m => (m.id === id ? { ...m, expended: !m.expended } : m)) };
}

/** Only an existing stance id can be active; anything else (or null) clears it. */
export function setActiveStance(data: PathOfWarData, id: string | null): PathOfWarData {
  return { ...data, activeStanceId: id !== null && data.stances.some(s => s.id === id) ? id : null };
}

/** Soft warnings only; nothing is blocked. */
export function overLimits(data: PathOfWarData): string[] {
  const out: string[] = [];
  const { maneuversKnown, maneuversReadied, stancesKnown } = data.limits;
  if (maneuversKnown > 0 && data.maneuvers.length > maneuversKnown) out.push(`Maneuvers known: ${data.maneuvers.length} / ${maneuversKnown}`);
  const readied = data.maneuvers.filter(m => m.readied).length;
  if (maneuversReadied > 0 && readied > maneuversReadied) out.push(`Maneuvers readied: ${readied} / ${maneuversReadied}`);
  if (stancesKnown > 0 && data.stances.length > stancesKnown) out.push(`Stances known: ${data.stances.length} / ${stancesKnown}`);
  return out;
}

export function saveDC(level: number, mod: number): number {
  return 10 + level + mod;
}

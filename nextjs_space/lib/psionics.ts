import { z } from 'zod';

export const KEY_ABILITIES = ['int', 'wis', 'cha'] as const;
export type KeyAbility = (typeof KEY_ABILITIES)[number];
export const MAX_POWERS = 100;

export interface PPPool { max: number; current: number; temp: number }
export interface PsionicPower {
  id: string; name: string; discipline: string; level: number; ppCost: number; display: string;
  manifestingTime: string; range: string; duration: string; save: string; powerResistance: string;
  augment: string; description: string;
}
export interface PsionicsData {
  pp: PPPool; manifesterLevel: number; keyAbility: KeyAbility; psionicFocus: boolean; powers: PsionicPower[];
}

const int = (min: number, max: number) =>
  z.preprocess(v => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.trunc(v))) : 0), z.number().int().min(min).max(max));
const text = (max: number) =>
  z.preprocess(v => (typeof v === 'string' ? v.slice(0, max) : ''), z.string().max(max));

export const powerSchema = z.object({
  id: z.preprocess(v => (typeof v === 'string' ? v.slice(0, 100) : ''), z.string().min(1).max(100)),
  name: text(100), discipline: text(40), level: int(0, 9), ppCost: int(0, 1000), display: text(100),
  manifestingTime: text(100), range: text(100), duration: text(100), save: text(100), powerResistance: text(100),
  augment: text(2000), description: text(10000),
});

export const psionicsSchema = z.object({
  pp: z.preprocess(v => (v && typeof v === 'object' ? v : {}), z.object({ max: int(0, 10000), current: int(0, 10000), temp: int(0, 10000) })),
  manifesterLevel: int(0, 40),
  keyAbility: z.preprocess(v => (KEY_ABILITIES.includes(v as KeyAbility) ? v : 'int'), z.enum(KEY_ABILITIES)),
  psionicFocus: z.preprocess(v => v === true, z.boolean()),
  powers: z.array(powerSchema),
});

export function defaultPsionics(): PsionicsData {
  return { pp: { max: 0, current: 0, temp: 0 }, manifesterLevel: 0, keyAbility: 'int', psionicFocus: false, powers: [] };
}

/** Coerces anything into valid, clamped psionics data (invalid powers are dropped, max 100). */
export function normalizePsionics(raw: unknown): PsionicsData {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultPsionics();
  const rec = raw as Record<string, unknown>;
  const powers: PsionicPower[] = [];
  for (const item of Array.isArray(rec.powers) ? rec.powers : []) {
    if (powers.length >= MAX_POWERS) break;
    const parsed = powerSchema.safeParse(item);
    if (parsed.success) powers.push(parsed.data);
  }
  const parsed = psionicsSchema.parse({ ...rec, powers });
  return { ...parsed, pp: clampPool(parsed.pp) };
}

/** Current PP is always within 0..max. */
export function clampPool(pool: PPPool): PPPool {
  const max = Math.max(0, pool.max);
  return { ...pool, max, current: Math.min(max, Math.max(0, pool.current)) };
}

/** Sanitizes the `psionics` key of a spells object in place-safe fashion (returns a copy). Other keys untouched. */
export function sanitizeSpellsPsionics<T>(spells: T): T {
  if (!spells || typeof spells !== 'object' || Array.isArray(spells)) return spells;
  if (!Object.prototype.hasOwnProperty.call(spells, 'psionics')) return spells;
  return { ...spells, psionics: normalizePsionics((spells as Record<string, unknown>).psionics) };
}

export function spendPP(pool: PPPool, n: number): { ok: boolean; pool: PPPool; error?: string } {
  if (!Number.isInteger(n) || n < 0) return { ok: false, pool, error: 'Enter a whole number of power points (0 or more)' };
  if (n > pool.temp + pool.current) return { ok: false, pool, error: 'Not enough power points' };
  const fromTemp = Math.min(pool.temp, n);
  return { ok: true, pool: { ...pool, temp: pool.temp - fromTemp, current: pool.current - (n - fromTemp) } };
}

export function restorePP(pool: PPPool, n: number): PPPool {
  const amount = Number.isInteger(n) && n > 0 ? n : 0;
  return { ...pool, current: Math.min(pool.max, Math.max(0, pool.current + amount)) };
}

export function restPool(pool: PPPool): PPPool {
  return { ...pool, current: pool.max, temp: 0 };
}

export function manifestCost(
  power: Pick<PsionicPower, 'ppCost'>, augmentPP: number, manifesterLevel: number,
): { ok: boolean; cost: number; error?: string } {
  if (!Number.isInteger(augmentPP) || augmentPP < 0) return { ok: false, cost: 0, error: 'Augment PP must be a whole number (0 or more)' };
  const cost = power.ppCost + augmentPP;
  if (cost > manifesterLevel) return { ok: false, cost, error: `Cannot spend more than your manifester level (${manifesterLevel}) PP on one power` };
  return { ok: true, cost };
}

export function saveDC(powerLevel: number, keyAbilityMod: number): number {
  return 10 + powerLevel + keyAbilityMod;
}

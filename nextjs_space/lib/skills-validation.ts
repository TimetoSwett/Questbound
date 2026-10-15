export interface SkillEntry {
  name: string;
  ranks: number;
  classSkill: boolean;
  misc: number;
  ability?: string;
  extraAbility?: string;
  id?: string;
  base?: 'Craft' | 'Profession';
  specialty?: string;
  custom?: boolean;
}

const abilities = new Set(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']);
const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : 0;

export function sanitizeSkills(values: unknown[]): SkillEntry[] {
  const result: SkillEntry[] = [];
  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const raw = value as Record<string, unknown>;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 80) : '';
    if (!name) continue;
    const entry: SkillEntry = { name, ranks: integer(raw.ranks, 0, 100), misc: integer(raw.misc, -100, 100), classSkill: raw.classSkill === true };
    if (typeof raw.ability === 'string' && abilities.has(raw.ability)) entry.ability = raw.ability;
    if (typeof raw.extraAbility === 'string' && (raw.extraAbility === '' || abilities.has(raw.extraAbility))) entry.extraAbility = raw.extraAbility;
    if (typeof raw.id === 'string') entry.id = raw.id.slice(0, 100);
    if (raw.base === 'Craft' || raw.base === 'Profession') entry.base = raw.base;
    if (typeof raw.specialty === 'string') entry.specialty = raw.specialty.slice(0, 60);
    if (typeof raw.custom === 'boolean') entry.custom = raw.custom;
    if (entry.base) entry.name = entry.specialty ? `${entry.base} (${entry.specialty})` : entry.base;
    result.push(entry);
    if (result.length >= 200) break;
  }
  return result;
}

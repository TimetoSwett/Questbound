import { equipmentSkillPenalty } from './equipment';
import type { SkillEntry } from './skills-validation';

export interface SkillDef {
  name: string;
  ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';
}

export const PF1E_SKILLS: SkillDef[] = [
  { name: 'Acrobatics', ability: 'DEX' },
  { name: 'Appraise', ability: 'INT' },
  { name: 'Bluff', ability: 'CHA' },
  { name: 'Climb', ability: 'STR' },
  { name: 'Craft', ability: 'INT' },
  { name: 'Diplomacy', ability: 'CHA' },
  { name: 'Disable Device', ability: 'DEX' },
  { name: 'Disguise', ability: 'CHA' },
  { name: 'Escape Artist', ability: 'DEX' },
  { name: 'Fly', ability: 'DEX' },
  { name: 'Handle Animal', ability: 'CHA' },
  { name: 'Heal', ability: 'WIS' },
  { name: 'Intimidate', ability: 'CHA' },
  { name: 'Knowledge (Arcana)', ability: 'INT' },
  { name: 'Knowledge (Dungeoneering)', ability: 'INT' },
  { name: 'Knowledge (Engineering)', ability: 'INT' },
  { name: 'Knowledge (Geography)', ability: 'INT' },
  { name: 'Knowledge (History)', ability: 'INT' },
  { name: 'Knowledge (Local)', ability: 'INT' },
  { name: 'Knowledge (Nature)', ability: 'INT' },
  { name: 'Knowledge (Nobility)', ability: 'INT' },
  { name: 'Knowledge (Planes)', ability: 'INT' },
  { name: 'Knowledge (Religion)', ability: 'INT' },
  { name: 'Linguistics', ability: 'INT' },
  { name: 'Perception', ability: 'WIS' },
  { name: 'Perform', ability: 'CHA' },
  { name: 'Profession', ability: 'WIS' },
  { name: 'Ride', ability: 'DEX' },
  { name: 'Sense Motive', ability: 'WIS' },
  { name: 'Sleight of Hand', ability: 'DEX' },
  { name: 'Spellcraft', ability: 'INT' },
  { name: 'Stealth', ability: 'DEX' },
  { name: 'Survival', ability: 'WIS' },
  { name: 'Swim', ability: 'STR' },
  { name: 'Use Magic Device', ability: 'CHA' },
];

export function abilityMod(score: number): number {
  return Math.floor(((score ?? 10) - 10) / 2);
}

export function formatMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Combined ability modifier for one skill row: the entry's chosen ability
 * (or the skill's default when none is chosen) plus a second ability when
 * one is picked and differs from the primary.
 */
export function skillAbilityMod(
  entry: SkillEntry,
  skill: SkillDef,
  abilityModForSkill: (ability: string) => number,
): number {
  const primary = entry.ability || skill.ability;
  const extra = entry.extraAbility && entry.extraAbility !== primary ? entry.extraAbility : '';
  return abilityModForSkill(primary) + (extra ? abilityModForSkill(extra) : 0);
}

/**
 * Skill total, exactly as the sheet row displays it: ranks + class-skill
 * bonus (+3, only with at least 1 rank) + ability mod(s) + misc + armor
 * check penalty (STR/DEX skills only, per the skill's default ability) +
 * gear bonuses. Extracted verbatim from SkillRow so it can be unit-tested.
 */
export function skillTotal({
  entry,
  skill,
  abilityModForSkill,
  gearSkill,
  checkPenalty,
}: {
  entry: SkillEntry;
  skill: SkillDef;
  abilityModForSkill: (ability: string) => number;
  gearSkill: number;
  checkPenalty: number;
}): number {
  const ranks = entry.ranks ?? 0;
  const csBonus = entry.classSkill && ranks >= 1 ? 3 : 0;
  return (
    ranks +
    csBonus +
    skillAbilityMod(entry, skill, abilityModForSkill) +
    (entry.misc ?? 0) +
    equipmentSkillPenalty(skill.ability, checkPenalty) +
    gearSkill
  );
}

// Presentation helpers for the Cyberpunk Basics sheet. Formulas and skill
// grouping live here so the panel can autofill Run/Leap/Carry/Lift without
// asking the shared model to recompute stored numbers. Catalogs, stat groups,
// and official rows come from lib/cyberpunk-sheet.

import {
  CYBERPUNK_DEFAULT_SKILLS,
  CYBERPUNK_DERIVED_KEYS,
  CYBERPUNK_SKILL_GROUPS,
  CYBERPUNK_SKILLS_BY_GROUP,
  addOfficialCyberpunkSkills,
  type CyberpunkDerived,
  type CyberpunkDerivedKey,
  type CyberpunkSheet,
  type CyberpunkSkill,
  type CyberpunkSkillStat,
  type CyberpunkStat,
} from '@/lib/cyberpunk-sheet';

/** Named groups, then OTHER for a custom skill. LUCK and MA are character stats, not skill groups. */
export const CYBERPUNK_SKILL_STAT_OPTIONS = [...CYBERPUNK_SKILL_GROUPS, 'OTHER'] as const satisfies readonly CyberpunkSkillStat[];

export const DERIVED_HINTS = {
  run: 'MA × 3',
  leap: 'Run / 4',
  carry: 'BODY × 10 kg',
  lift: 'BODY × 40 kg',
} as const satisfies Record<CyberpunkDerivedKey, string>;

export type DerivedManual = Record<CyberpunkDerivedKey, boolean>;

const VARIABLE_TEMPLATES = new Set<string>(
  CYBERPUNK_SKILL_GROUPS.flatMap((stat) =>
    CYBERPUNK_SKILLS_BY_GROUP[stat].filter((name) =>
      name === 'Expert' || name === 'Language' || name.startsWith('Martial Art '))),
);

export function isVariableSkillTemplate(name: string): boolean {
  return VARIABLE_TEMPLATES.has(name);
}

export function roundMeasure(value: number): number {
  return Math.round(value * 100) / 100;
}

function sameMeasure(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return left === right;
  return roundMeasure(left) === roundMeasure(right);
}

export function formulaRun(ma: number | null): number | null {
  if (ma === null) return null;
  return roundMeasure(ma * 3);
}

export function formulaLeap(run: number | null): number | null {
  if (run === null) return null;
  return roundMeasure(run / 4);
}

export function formulaCarry(body: number | null): number | null {
  if (body === null) return null;
  return roundMeasure(body * 10);
}

export function formulaLift(body: number | null): number | null {
  if (body === null) return null;
  return roundMeasure(body * 40);
}

function shownRun(stats: CyberpunkSheet['stats'], derived: CyberpunkDerived, manual: DerivedManual): number | null {
  const formula = formulaRun(stats.MA);
  return manual.run ? derived.run : (derived.run ?? formula);
}

/** Values to show. A blank stored field follows the formula until the player overrides it. */
export function displayedDerived(sheet: CyberpunkSheet, manual: DerivedManual): CyberpunkDerived {
  const run = shownRun(sheet.stats, sheet.derived, manual);
  return {
    run,
    leap: manual.leap ? sheet.derived.leap : (sheet.derived.leap ?? formulaLeap(run)),
    carry: manual.carry ? sheet.derived.carry : (sheet.derived.carry ?? formulaCarry(sheet.stats.BODY)),
    lift: manual.lift ? sheet.derived.lift : (sheet.derived.lift ?? formulaLift(sheet.stats.BODY)),
  };
}

/** A stored number that differs from the current formula is a manual override. Null is not. */
export function inferDerivedManual(sheet: CyberpunkSheet): DerivedManual {
  const blank: DerivedManual = { run: false, leap: false, carry: false, lift: false };
  const runFormula = formulaRun(sheet.stats.MA);
  const run = sheet.derived.run !== null && !sameMeasure(sheet.derived.run, runFormula);
  const leapFormula = formulaLeap(shownRun(sheet.stats, sheet.derived, { ...blank, run }));
  const carryFormula = formulaCarry(sheet.stats.BODY);
  const liftFormula = formulaLift(sheet.stats.BODY);
  return {
    run,
    leap: sheet.derived.leap !== null && !sameMeasure(sheet.derived.leap, leapFormula),
    carry: sheet.derived.carry !== null && !sameMeasure(sheet.derived.carry, carryFormula),
    lift: sheet.derived.lift !== null && !sameMeasure(sheet.derived.lift, liftFormula),
  };
}

export function applyStatEdit(
  sheet: CyberpunkSheet,
  manual: DerivedManual,
  stat: CyberpunkStat,
  value: number | null,
): { sheet: CyberpunkSheet; manual: DerivedManual } {
  const stats = { ...sheet.stats, [stat]: value };
  const derived = { ...sheet.derived };
  if (stat === 'MA') {
    const runFormula = formulaRun(value);
    if (!manual.run) derived.run = runFormula;
    const runShown = manual.run ? derived.run : (derived.run ?? runFormula);
    if (!manual.leap) derived.leap = formulaLeap(runShown);
  }
  if (stat === 'BODY') {
    if (!manual.carry) derived.carry = formulaCarry(value);
    if (!manual.lift) derived.lift = formulaLift(value);
  }
  return { sheet: { ...sheet, stats, derived }, manual };
}

export function applyDerivedEdit(
  sheet: CyberpunkSheet,
  manual: DerivedManual,
  key: CyberpunkDerivedKey,
  value: number | null,
): { sheet: CyberpunkSheet; manual: DerivedManual } {
  const nextManual = { ...manual };
  const derived = { ...sheet.derived, [key]: value };
  if (key === 'run') {
    const formula = formulaRun(sheet.stats.MA);
    nextManual.run = value !== null && !sameMeasure(value, formula);
    const runShown = nextManual.run ? value : (value ?? formula);
    if (!nextManual.leap) derived.leap = formulaLeap(runShown);
  } else if (key === 'leap') {
    const runShown = shownRun(sheet.stats, { ...sheet.derived, run: sheet.derived.run }, manual);
    nextManual.leap = value !== null && !sameMeasure(value, formulaLeap(runShown));
  } else if (key === 'carry') {
    nextManual.carry = value !== null && !sameMeasure(value, formulaCarry(sheet.stats.BODY));
  } else {
    nextManual.lift = value !== null && !sameMeasure(value, formulaLift(sheet.stats.BODY));
  }
  return { sheet: { ...sheet, derived }, manual: nextManual };
}

function matchingVariableTemplate(stat: CyberpunkSkillStat, name: string): string | null {
  if (stat !== 'INT' && stat !== 'REF') return null;
  for (const template of CYBERPUNK_SKILLS_BY_GROUP[stat]) {
    if (!isVariableSkillTemplate(template)) continue;
    if (name === template || name.startsWith(`${template}: `)) return template;
  }
  return null;
}

/**
 * Official skills in sheet order, then custom rows. "Language: Japanese" fills
 * the next Language slot; extra renamed rows stay custom. Does not write the
 * catalog into an untouched sheet by itself — callers save the returned list
 * only after an edit.
 */
export function presentCyberpunkSkills(skills: readonly CyberpunkSkill[]): CyberpunkSkill[] {
  const capacity = new Map<string, number>();
  for (const template of CYBERPUNK_DEFAULT_SKILLS) {
    if (!isVariableSkillTemplate(template.name)) continue;
    const key = `${template.stat}|${template.name}`;
    capacity.set(key, (capacity.get(key) ?? 0) + 1);
  }
  const taken = new Map<string, number>();
  const annotations = skills.map((skill) => {
    const template = matchingVariableTemplate(skill.stat, skill.name);
    if (!template) return { skill: { ...skill }, specialty: null as string | null };
    const key = `${skill.stat}|${template}`;
    const used = taken.get(key) ?? 0;
    if (used >= (capacity.get(key) ?? 0)) return { skill: { ...skill }, specialty: null };
    taken.set(key, used + 1);
    const specialty = skill.name === template ? '' : skill.name.slice(template.length + 2);
    return { skill: { ...skill, name: template }, specialty };
  });
  const expanded = addOfficialCyberpunkSkills(annotations.map((row) => row.skill));
  const usedIndexes = new Set<number>();
  const official = CYBERPUNK_DEFAULT_SKILLS.map((template, index) => {
    const found = annotations.findIndex((row, skillIndex) =>
      !usedIndexes.has(skillIndex) && row.skill.name === template.name && row.skill.stat === template.stat);
    const base = expanded[index];
    if (found === -1) return base;
    usedIndexes.add(found);
    const specialty = annotations[found].specialty;
    if (!specialty) return base;
    return { ...base, name: `${template.name}: ${specialty}` };
  });
  return [...official, ...expanded.slice(CYBERPUNK_DEFAULT_SKILLS.length)];
}

export function skillSpecialty(name: string, templateName: string): string {
  if (name === templateName) return '';
  const prefix = `${templateName}: `;
  return name.startsWith(prefix) ? name.slice(prefix.length) : '';
}

export function withSkillSpecialty(templateName: string, specialty: string): string {
  if (specialty.trim() === '') return templateName;
  return `${templateName}: ${specialty}`;
}

export function officialSkillCount(): number {
  return CYBERPUNK_DEFAULT_SKILLS.length;
}

export function isSkillStatOption(value: string): value is CyberpunkSkillStat {
  return (CYBERPUNK_SKILL_STAT_OPTIONS as readonly string[]).includes(value);
}

export const DERIVED_KEY_LIST = CYBERPUNK_DERIVED_KEYS;

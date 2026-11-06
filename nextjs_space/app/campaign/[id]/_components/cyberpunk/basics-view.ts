// Presentation helpers for the Cyberpunk Basics sheet. Formulas and skill
// grouping live here so the panel can autofill Run/Leap/Carry/Lift without
// asking the shared model to recompute stored numbers. Catalogs, stat groups,
// and official rows come from lib/cyberpunk-sheet.

import {
  CYBERPUNK_DEFAULT_SKILLS,
  CYBERPUNK_DERIVED_KEYS,
  CYBERPUNK_SKILL_GROUPS,
  CYBERPUNK_SKILLS_BY_GROUP,
  normalizeCyberpunkSkillStat,
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

/** Official catalog rows keep a fixed key. Saved rows stay custom and keep their key when a neighbor is removed. */
export type PresentedSkill = CyberpunkSkill & {
  key: string;
  source: 'official' | 'custom';
  catalogIndex?: number;
};

function copySkill(skill: CyberpunkSkill): CyberpunkSkill {
  return {
    name: skill.name,
    stat: normalizeCyberpunkSkillStat(skill.stat),
    value: skill.value ?? null,
    chipped: skill.chipped === true,
  };
}

function matchesOfficialSlot(skill: { name: string; stat: string }, template: CyberpunkSkill): boolean {
  if (normalizeCyberpunkSkillStat(skill.stat) !== template.stat) return false;
  if (skill.name === template.name) return true;
  return isVariableSkillTemplate(template.name) && skill.name.startsWith(`${template.name}: `);
}

/** True only after this sheet has already stored the official block in catalog order. */
function hasOfficialPrefix(skills: readonly CyberpunkSkill[]): boolean {
  if (skills.length < CYBERPUNK_DEFAULT_SKILLS.length) return false;
  return CYBERPUNK_DEFAULT_SKILLS.every((template, index) => matchesOfficialSlot(skills[index], template));
}

function officialRows(skills: readonly CyberpunkSkill[] | null): PresentedSkill[] {
  return CYBERPUNK_DEFAULT_SKILLS.map((template, catalogIndex) => {
    const saved = skills?.[catalogIndex];
    const skill = saved && matchesOfficialSlot(saved, template) ? copySkill(saved) : {
      name: template.name,
      stat: template.stat,
      value: null,
      chipped: false,
    };
    return { ...skill, stat: template.stat, key: `official:${catalogIndex}`, source: 'official', catalogIndex };
  });
}

function customRows(skills: readonly CyberpunkSkill[]): PresentedSkill[] {
  return skills.map((skill, index) => ({
    ...copySkill(skill),
    key: `custom:${index}`,
    source: 'custom' as const,
  }));
}

/**
 * Saved rows stay editable custom skills, including ones that share an official
 * name. The official catalog is added in front only when that block is not
 * already stored, so a second pass does not duplicate it. Duplicate custom
 * names are kept as separate rows.
 */
export function presentCyberpunkSkills(skills: readonly CyberpunkSkill[]): PresentedSkill[] {
  if (hasOfficialPrefix(skills)) {
    return [...officialRows(skills), ...customRows(skills.slice(CYBERPUNK_DEFAULT_SKILLS.length))];
  }
  return [...officialRows(null), ...customRows(skills)];
}

export function storedCyberpunkSkills(rows: readonly PresentedSkill[]): CyberpunkSkill[] {
  return rows.map(({ name, stat, value, chipped }) => ({ name, stat, value, chipped }));
}

export function updatePresentedSkill(
  rows: readonly PresentedSkill[],
  key: string,
  patch: Partial<CyberpunkSkill>,
): PresentedSkill[] {
  return rows.map((row) => {
    if (row.key !== key) return row;
    if (row.source === 'official') {
      const next = { ...row };
      if (patch.value !== undefined) next.value = patch.value;
      if (patch.chipped !== undefined) next.chipped = patch.chipped === true;
      const template = row.catalogIndex === undefined ? undefined : CYBERPUNK_DEFAULT_SKILLS[row.catalogIndex];
      if (patch.name !== undefined && template && isVariableSkillTemplate(template.name)) next.name = patch.name;
      return next;
    }
    const stat = patch.stat === undefined ? row.stat : normalizeCyberpunkSkillStat(patch.stat);
    return { ...row, ...patch, stat, key: row.key, source: 'custom' };
  });
}

export function removePresentedSkill(rows: readonly PresentedSkill[], key: string): PresentedSkill[] {
  return rows.filter((row) => row.source === 'official' || row.key !== key);
}

export function appendCustomSkill(rows: readonly PresentedSkill[], skill: CyberpunkSkill): PresentedSkill[] {
  const used = new Set(rows.map((row) => row.key));
  let index = 0;
  while (used.has(`custom:${index}`)) index += 1;
  return [...rows, { ...copySkill(skill), key: `custom:${index}`, source: 'custom' }];
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

export function isSkillStatOption(value: string): value is CyberpunkSkillStat {
  return (CYBERPUNK_SKILL_STAT_OPTIONS as readonly string[]).includes(value);
}

export const DERIVED_KEY_LIST = CYBERPUNK_DERIVED_KEYS;

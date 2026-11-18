// Pathfinder sheet math: skill totals, coin conversions, and weapon
// damage/size rules. No server and no database.
// Run: npm run test:pf-sheet-math
import assert from 'node:assert/strict';
import { abilityMod, formatMod, PF1E_SKILLS, skillAbilityMod, skillTotal } from '../lib/pf1e-skills';
import { breakdownCoins, formatCoins } from '../lib/coins';
import { formatWeaponDamage, sizedDamage, strengthDamage, weaponTotals } from '../lib/equipment';
import type { SkillEntry } from '../lib/skills-validation';

// Ability modifiers: floor((score - 10) / 2), defaulting to 10.
for (const [score, mod] of [[1, -5], [7, -2], [8, -1], [9, -1], [10, 0], [11, 0], [12, 1], [13, 1], [14, 2], [16, 3], [18, 4], [20, 5], [0, -5], [30, 10]] as const) {
  assert.equal(abilityMod(score), mod, `score ${score}`);
}
assert.equal(formatMod(0), '+0');
assert.equal(formatMod(3), '+3');
assert.equal(formatMod(-2), '-2');
assert.equal(formatMod(10), '+10');

// Skill totals: ranks + class-skill bonus + ability mod(s) + misc +
// armor check penalty (STR/DEX skills only) + gear bonuses.
const stealth = PF1E_SKILLS.find((skill) => skill.name === 'Stealth')!;
const arcana = PF1E_SKILLS.find((skill) => skill.name === 'Knowledge (Arcana)')!;
const mods = { STR: 3, DEX: 2, CON: 1, INT: 0, WIS: -1, CHA: -2 };
const modFor = (ability: string) => mods[ability as keyof typeof mods] ?? 0;
const total = (entry: SkillEntry, skill = stealth, gearSkill = 0, checkPenalty = 0) =>
  skillTotal({ entry, skill, abilityModForSkill: modFor, gearSkill, checkPenalty });
const entry = (overrides: Partial<SkillEntry> = {}): SkillEntry =>
  ({ name: 'Stealth', ranks: 0, classSkill: false, misc: 0, ...overrides });
assert.equal(total(entry({ ranks: 5, classSkill: true })), 10); // 5 + 3 + 2
assert.equal(total(entry({ ranks: 0, classSkill: true })), 2); // no +3 without a rank
assert.equal(total(entry({ ranks: 0, classSkill: false })), 2);
assert.equal(total(entry({ ranks: 5, classSkill: true, misc: -2 })), 8);
assert.equal(total(entry({ ranks: 5, classSkill: true }), stealth, 0, -4), 6); // armor check penalty
assert.equal(total(entry({ name: 'Knowledge (Arcana)', ranks: 2, classSkill: true }), arcana, 0, -4), 5); // INT: no penalty
// An overridden ability changes the mod used, but the penalty still keys off
// the skill's default ability.
assert.equal(total(entry({ ranks: 1, classSkill: true, ability: 'INT' }), stealth, 0, -4), 0); // 1 + 3 + 0 - 4
assert.equal(total(entry({ ranks: 1, classSkill: true, extraAbility: 'STR' })), 9); // 1 + 3 + 2 + 3
assert.equal(total(entry({ ranks: 1, classSkill: true, extraAbility: 'DEX' })), 6); // same as primary: ignored
assert.equal(total(entry({ ranks: 1, classSkill: true, extraAbility: '' })), 6);
assert.equal(total(entry({ ranks: 5, classSkill: true }), stealth, 2), 12); // gear bonuses
assert.equal(total({ name: 'Stealth', classSkill: false } as unknown as SkillEntry), 2); // missing ranks/misc read as 0
// The combined ability mod on its own.
assert.equal(skillAbilityMod(entry({ extraAbility: 'STR' }), stealth, modFor), 5);
assert.equal(skillAbilityMod(entry({ extraAbility: 'DEX' }), stealth, modFor), 2);
assert.equal(skillAbilityMod(entry({ ability: 'INT' }), stealth, modFor), 0);
assert.equal(skillAbilityMod(entry({ extraAbility: 'WIS' }), arcana, modFor), -1);

// Coin conversions: stored as copper, 1 pp = 10 gp = 100 sp = 1000 cp.
assert.deepEqual(breakdownCoins(0), { pp: 0, gp: 0, sp: 0, cp: 0 });
assert.deepEqual(breakdownCoins(1234), { pp: 1, gp: 2, sp: 3, cp: 4 });
assert.deepEqual(breakdownCoins(999), { pp: 0, gp: 9, sp: 9, cp: 9 });
for (const [cp, text] of [
  [0, '0 cp'], [1, '1 cp'], [9, '9 cp'], [10, '1 sp'], [11, '1 sp, 1 cp'],
  [99, '9 sp, 9 cp'], [100, '1 gp'], [101, '1 gp, 1 cp'], [999, '9 gp, 9 sp, 9 cp'],
  [1000, '1 pp'], [1234, '1 pp, 2 gp, 3 sp, 4 cp'], [10000, '10 pp'], [100000, '100 pp'],
] as const) {
  assert.equal(formatCoins(cp), text, `${cp} cp`);
}

// Weapon damage by size: larger dice step along fixed progressions, and can
// only step down one size before the die is left unchanged.
assert.equal(sizedDamage('3d6', 'Tiny'), '1d8');
assert.equal(sizedDamage('3d6', 'Small'), '2d6');
assert.equal(sizedDamage('3d6', 'Diminutive'), '1d6');
assert.equal(sizedDamage('3d6', 'Fine'), '3d6');
assert.equal(sizedDamage('3d6', 'Large'), '4d6');
assert.equal(sizedDamage('3d6', 'Colossal'), '12d6');
assert.equal(sizedDamage('4d6', 'Large'), '6d6');
assert.equal(sizedDamage('6d6', 'Large'), '8d6');
assert.equal(sizedDamage('6d6', 'Huge'), '12d6');
assert.equal(sizedDamage('8d6', 'Large'), '12d6');
// Past the end of a chain the die is left unchanged, not clamped.
assert.equal(sizedDamage('8d6', 'Huge'), '8d6');
assert.equal(sizedDamage('8d6', 'Colossal'), '8d6');
assert.equal(sizedDamage('6d6', 'Gargantuan'), '6d6');
assert.equal(sizedDamage('4d6', 'Colossal'), '4d6');
assert.equal(sizedDamage('3d8', 'Tiny'), '1d10');
assert.equal(sizedDamage('3d8', 'Diminutive'), '1d8');
assert.equal(sizedDamage('2d8', 'Large'), '3d8');
assert.equal(sizedDamage('1d8', 'large'), '2d6'); // case-insensitive
assert.equal(sizedDamage('1d8', 'LARGE'), '2d6');
assert.equal(sizedDamage(' 1d8 ', 'Large'), '2d6'); // surrounding space
assert.equal(sizedDamage('1d8', 'Huge-ish'), '1d8'); // unknown size: unchanged
assert.equal(sizedDamage('1d8', ''), '1d8');
assert.equal(sizedDamage('1d8', null), '1d8');
assert.equal(sizedDamage('2d20', 'Large'), '2d20'); // unknown die: unchanged
assert.equal(sizedDamage('1d6+2', 'Large'), '1d6+2');

// Strength to damage, by weapon category and hands.
assert.equal(strengthDamage(5, 'ranged', 'two'), 0);
assert.equal(strengthDamage(5, 'composite', 'two'), 5);
assert.equal(strengthDamage(-2, 'composite', 'two'), -2);
assert.equal(strengthDamage(-3, 'melee', 'two'), -3); // penalties always in full
assert.equal(strengthDamage(4, 'melee', 'two'), 6); // x1.5, rounded down
assert.equal(strengthDamage(4, 'melee', 'off'), 2); // x0.5, rounded down
assert.equal(strengthDamage(5, 'melee', 'one'), 5);
assert.equal(strengthDamage(4, 'thrown', 'two'), 6);
assert.equal(strengthDamage(3, undefined, undefined), 3);

// Weapon totals: extra attack/damage stack on top, and the die scales with
// size only for Medium-base weapons.
const weapon = { name: 'Sword', attackBonus: 1, ability: 'str' as const, damage: '1d8', damageBonus: 2, crit: '19-20/x2', range: 0, type: 'S' };
assert.equal(weaponTotals(weapon, 6, 3, 5, -1, 2, 3).attack, 11);
assert.equal(weaponTotals(weapon, 6, 3, 5, -1, 2, 3).damage, '1d8+8');
assert.equal(weaponTotals(weapon, 0, 3, 0, 0, 0, -5).damage, '1d8');
const medium = { ...weapon, baseDie: 'medium' as const };
assert.equal(formatWeaponDamage(medium, 0, 2, 0, 0, 0, 0, 'Small'), '1d6+4'); // +2 Str, +2 weapon bonus
assert.equal(formatWeaponDamage(medium, 0, 2, 0, 0, 0, 0, 'Tiny'), '1d4+4');
assert.equal(formatWeaponDamage(medium, 0, 2, 0, 0, 0, 0, 'Medium'), '1d8+4');

console.log('Pathfinder skill totals, coin conversions, and weapon damage/size tests passed.');

// Model tests for Character.cyberpunk v2. No server and no database.
// Run: npm run test:cyberpunk-sheet
import assert from 'node:assert/strict';
import { parseCharacterCreateBody } from '../lib/character-name';
import {
  CYBERPUNK_ARMOR_LOCATIONS,
  CYBERPUNK_ARMOR_LOCATION_INFO,
  CYBERPUNK_DEFAULT_SKILLS,
  CYBERPUNK_DERIVED_KEYS,
  CYBERPUNK_LIFEPATH_FIELDS,
  CYBERPUNK_LIFEPATH_LABELS,
  CYBERPUNK_LIMITS,
  CYBERPUNK_ROLES,
  CYBERPUNK_ROLE_SPECIAL_ABILITY,
  CYBERPUNK_SHEET_MAX_BYTES,
  CYBERPUNK_SKILL_GROUPS,
  CYBERPUNK_SKILLS_BY_GROUP,
  CYBERPUNK_SPECIAL_ABILITIES,
  CYBERPUNK_STATS,
  CYBERPUNK_WEAPON_COLUMNS,
  CYBERPUNK_WOUND_BOXES,
  CYBERPUNK_WOUND_COLUMNS,
  addOfficialCyberpunkSkills,
  defaultCyberpunkSheet,
  normalizeCyberpunkSkillStat,
  readCyberpunkSheet,
  sanitizeCyberpunkSheet,
  type CyberpunkSheet,
} from '../lib/cyberpunk-sheet';

const TOP_KEYS = [
  'handle', 'role', 'characterPoints', 'age', 'rep', 'currentIp', 'humanity', 'money',
  'stats', 'derived', 'specialAbilities', 'skills', 'save', 'btm', 'wounds', 'armor',
  'cybernetics', 'cyberneticsTotals', 'gear', 'weapons', 'lifepath', 'drawingUrl',
];

function keysOf(value: object): string[] {
  return Object.keys(value).sort();
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function repeat(count: number, char = 'W'): string {
  return char.repeat(count);
}

// --- defaults ---

const first = defaultCyberpunkSheet();
const second = defaultCyberpunkSheet();
assert.deepEqual(keysOf(first), [...TOP_KEYS].sort());
assert.deepEqual(first.stats, { INT: 5, REF: 5, TECH: 5, COOL: 5, ATTR: 5, LUCK: 5, MA: 5, BODY: 5, EMP: 5 });
assert.equal(first.role, '');
assert.equal(first.handle, '');
assert.equal(first.skills.length, 0);
assert.equal(first.characterPoints, null);
assert.equal(first.age, null);
assert.equal(first.rep, null);
assert.equal(first.currentIp, null);
assert.equal(first.humanity, null);
assert.equal(first.money, null);
assert.deepEqual(first.derived, { run: null, leap: null, carry: null, lift: null });
assert.equal(first.save, null);
assert.equal(first.btm, null);
assert.equal(first.drawingUrl, null);
assert.deepEqual(first.cybernetics, []);
assert.deepEqual(first.cyberneticsTotals, { hl: null, euro: null });
assert.deepEqual(first.gear, []);
assert.deepEqual(first.weapons, []);
assert.deepEqual(first.lifepath.lifeEvents, []);
assert.equal(first.specialAbilities.length, CYBERPUNK_SPECIAL_ABILITIES.length);
assert.deepEqual(first.specialAbilities.map((row) => row.name), [...CYBERPUNK_SPECIAL_ABILITIES]);
assert.ok(first.specialAbilities.every((row) => row.value === null));
for (const column of CYBERPUNK_WOUND_COLUMNS) {
  assert.deepEqual(first.wounds[column], [false, false, false, false]);
}
for (const location of CYBERPUNK_ARMOR_LOCATIONS) assert.equal(first.armor[location], null);
for (const field of CYBERPUNK_LIFEPATH_FIELDS) assert.equal(first.lifepath[field], '');

first.stats.INT = 9;
first.skills.push({ name: 'Local', stat: 'OTHER', value: 1, chipped: true });
first.wounds.LIGHT[0] = true;
first.specialAbilities[0].value = 4;
assert.equal(second.stats.INT, 5);
assert.deepEqual(second.skills, []);
assert.equal(second.wounds.LIGHT[0], false);
assert.equal(second.specialAbilities[0].value, null);

// --- official catalog ---

const catalog = CYBERPUNK_SKILL_GROUPS.flatMap((stat) =>
  CYBERPUNK_SKILLS_BY_GROUP[stat].map((name) => ({ name, stat, value: null, chipped: false })),
);
assert.deepEqual(CYBERPUNK_DEFAULT_SKILLS.map((skill) => ({ ...skill })), catalog);
assert.equal(CYBERPUNK_DEFAULT_SKILLS.length, 87);
assert.deepEqual(
  CYBERPUNK_SKILL_GROUPS.map((stat) => CYBERPUNK_SKILLS_BY_GROUP[stat].length),
  [2, 3, 5, 7, 27, 22, 21],
);
assert.equal(CYBERPUNK_SKILLS_BY_GROUP.INT.filter((name) => name === 'Language').length, 3);
assert.deepEqual(
  CYBERPUNK_SKILLS_BY_GROUP.REF.filter((name) => name.startsWith('Martial Art')),
  ['Martial Art 1', 'Martial Art 2', 'Martial Art 3'],
);
const empathyNames: readonly string[] = CYBERPUNK_SKILLS_BY_GROUP.EMPATHY;
const techNames: readonly string[] = CYBERPUNK_SKILLS_BY_GROUP.TECH;
const refNames: readonly string[] = CYBERPUNK_SKILLS_BY_GROUP.REF;
assert.equal(empathyNames.includes('Persuation & Fast Talk'), true);
assert.equal(empathyNames.includes('Persuasion & Fast Talk'), false);
assert.equal(techNames.includes('Pharmacuticals'), true);
assert.equal(techNames.includes('Pharmaceuticals'), false);
assert.equal(refNames.includes('Operate Hvy. Machinery'), true);
assert.equal(CYBERPUNK_LIFEPATH_LABELS.affections, 'Affections');
assert.equal(CYBERPUNK_LIFEPATH_LABELS.valuedPosession, 'Valued Posession');
assert.equal(CYBERPUNK_WEAPON_COLUMNS.find((column) => column.key === 'dammage')?.label, 'Dammage');
assert.equal(CYBERPUNK_WEAPON_COLUMNS.find((column) => column.key === 'rndCap')?.label, '#');
assert.deepEqual([...CYBERPUNK_ROLES], [
  'Solo', 'Rocker', 'Netrunner', 'Media', 'Nomad', 'Fixer', 'Cop', 'Corp', 'Techie', 'Medtechie',
]);
assert.equal(CYBERPUNK_ROLE_SPECIAL_ABILITY.Solo, 'Combat Sense');
assert.equal(CYBERPUNK_ARMOR_LOCATION_INFO.rArm.label, 'R. Arm');
assert.equal(CYBERPUNK_ARMOR_LOCATION_INFO.lArm.label, 'L.Arm');
assert.equal(CYBERPUNK_ARMOR_LOCATION_INFO.rHand.label, 'Hand');
assert.equal(CYBERPUNK_ARMOR_LOCATION_INFO.rHand.side, 'right');
assert.equal(CYBERPUNK_WOUND_COLUMNS[0], 'LIGHT');
assert.equal(CYBERPUNK_WOUND_COLUMNS[CYBERPUNK_WOUND_COLUMNS.length - 1], 'MORTAL_6');
assert.equal(CYBERPUNK_WOUND_BOXES, 4);
assert.equal(Object.isFrozen(CYBERPUNK_DEFAULT_SKILLS), true);
assert.ok(CYBERPUNK_DEFAULT_SKILLS.every((skill) => Object.isFrozen(skill)));
assert.throws(() => {
  'use strict';
  (CYBERPUNK_DEFAULT_SKILLS[0] as { value: number | null }).value = 4;
});
assert.equal(CYBERPUNK_DEFAULT_SKILLS[0].value, null);

const seeded = addOfficialCyberpunkSkills([
  { name: 'Handgun', stat: 'REF', value: 7, chipped: true },
  { name: 'Human Perception', stat: 'EMP', value: 3, chipped: false },
  { name: 'Language', stat: 'INT', value: 2, chipped: false },
  { name: 'Language', stat: 'INT', value: 4, chipped: true },
  { name: 'Corporate Law', stat: 'INT', value: 5, chipped: false },
  { name: 'Handgun', stat: 'REF', value: 1, chipped: false },
]);
assert.equal(seeded.length, 87 + 2);
assert.equal(seeded.filter((skill) => skill.name === 'Language').length, 3);
const languages = seeded.filter((skill) => skill.name === 'Language' && skill.stat === 'INT');
assert.deepEqual(languages.map((skill) => skill.value), [2, 4, null]);
assert.equal(languages[1].chipped, true);
const handguns = seeded.filter((skill) => skill.name === 'Handgun');
assert.equal(handguns.length, 2);
assert.deepEqual(handguns[0], { name: 'Handgun', stat: 'REF', value: 7, chipped: true });
assert.equal(handguns[1].value, 1);
const perception = seeded.find((skill) => skill.name === 'Human Perception');
assert.deepEqual(perception, { name: 'Human Perception', stat: 'EMPATHY', value: 3, chipped: false });
assert.equal(seeded.at(-2)?.name, 'Corporate Law');
assert.equal(seeded.at(-1)?.value, 1);
assert.equal(seeded[0].name, 'Personal Grooming');
assert.equal(CYBERPUNK_DEFAULT_SKILLS[0].value, null);
assert.deepEqual(addOfficialCyberpunkSkills([]).map((skill) => skill.name), catalog.map((skill) => skill.name));

const crowded = addOfficialCyberpunkSkills(Array.from({ length: 200 }, (_, i) => ({
  name: `Custom ${i}`, stat: 'OTHER' as const, value: null, chipped: false,
})));
const crowdedSaved = sanitizeCyberpunkSheet({ skills: crowded });
assert.ok(crowdedSaved);
assert.equal(crowdedSaved.skills.length, 200);
assert.equal(crowdedSaved.skills[0].name, 'Personal Grooming');
assert.equal(crowdedSaved.skills[86].name, 'Weapons Tech');

// --- legacy stub, blanks, and stat aliases ---

const legacy = {
  stats: { INT: 5, REF: 8, TECH: 5, COOL: 9, ATTR: 5, LUCK: 5, MA: 5, BODY: 5, EMP: 0 },
  role: 'Rockerboy',
  skills: [{ name: 'Charismatic Leadership', stat: 'COOL', value: 6 }],
  extra: 'drop me',
};
const legacyRead = readCyberpunkSheet(legacy);
const legacySaved = sanitizeCyberpunkSheet(legacy);
assert.ok(legacySaved);
assert.equal(legacyRead.stats.REF, 8);
assert.equal(legacyRead.stats.COOL, 9);
assert.equal(legacyRead.stats.EMP, 0);
assert.equal(legacyRead.stats.INT, 5);
assert.equal(legacyRead.role, 'Rockerboy');
assert.deepEqual(legacyRead.skills, [{ name: 'Charismatic Leadership', stat: 'COOL', value: 6, chipped: false }]);
assert.equal(legacyRead.money, null);
assert.equal(legacyRead.derived.run, null);
assert.equal(legacyRead.specialAbilities.length, 10);
assert.equal(legacyRead.specialAbilities[2].value, null);
assert.equal(hasOwn(legacyRead, 'extra'), false);
assert.deepEqual(legacySaved.stats, legacyRead.stats);
assert.deepEqual(legacySaved.skills, legacyRead.skills);
assert.deepEqual(readCyberpunkSheet(JSON.stringify(legacy)).skills, legacyRead.skills);

const blanks = sanitizeCyberpunkSheet({
  stats: { REF: null, INT: 0, TECH: '', COOL: 10.9, ATTR: -4, LUCK: 11, MA: '8', BODY: false },
  skills: [{ name: 'Stealth', stat: 'REF', value: null, chipped: false }],
  money: null,
  btm: null,
  derived: { run: null, leap: null, carry: null, lift: null },
  armor: { skull: null },
});
assert.ok(blanks);
assert.equal(blanks.stats.REF, null);
assert.equal(blanks.stats.INT, 0);
assert.equal(blanks.stats.TECH, null);
assert.equal(blanks.stats.COOL, 10);
assert.equal(blanks.stats.ATTR, 0);
assert.equal(blanks.stats.LUCK, 10);
assert.equal(blanks.stats.MA, 8);
assert.equal(blanks.stats.BODY, null);
assert.equal(blanks.stats.EMP, 5);
assert.equal(blanks.skills[0].value, null);
assert.equal(blanks.money, null);
assert.equal(blanks.btm, null);
assert.equal(blanks.derived.run, null);
assert.equal(blanks.armor.skull, null);
assert.notEqual(blanks.stats.REF, 0);

const unclamped = readCyberpunkSheet({
  stats: { REF: 11, COOL: -3, INT: 10.9 },
  skills: [{ name: 'Pilot', stat: 'REF', value: 150 }],
  btm: -500,
  money: -20,
});
assert.equal(unclamped.stats.REF, 11);
assert.equal(unclamped.stats.COOL, -3);
assert.equal(unclamped.stats.INT, 10.9);
assert.equal(unclamped.stats.TECH, 5);
assert.equal(unclamped.skills[0].value, 150);
assert.equal(unclamped.btm, -500);
assert.equal(unclamped.money, -20);
assert.equal(unclamped.skills[0].chipped, false);

assert.equal(normalizeCyberpunkSkillStat('COOL'), 'COOL');
assert.equal(normalizeCyberpunkSkillStat(' empathy '), 'EMPATHY');
assert.equal(normalizeCyberpunkSkillStat('EMP'), 'EMPATHY');
assert.equal(normalizeCyberpunkSkillStat('WILL'), 'COOL');
assert.equal(normalizeCyberpunkSkillStat('LUCK'), 'OTHER');
assert.equal(normalizeCyberpunkSkillStat('MA'), 'OTHER');
assert.equal(normalizeCyberpunkSkillStat('Piloting'), 'OTHER');
assert.equal(normalizeCyberpunkSkillStat(''), 'OTHER');
assert.equal(normalizeCyberpunkSkillStat(3), 'OTHER');

const aliased = sanitizeCyberpunkSheet({
  skills: [
    { name: 'Persuation & Fast Talk', stat: 'emp', value: '4' },
    { name: 'Pharmacuticals', stat: 'TECH', value: -2, chipped: 1 },
    { name: 'Operate Hvy. Machinery', stat: 'REF', value: 250, chipped: 'X' },
    { name: 'Streetwise', stat: 'WILL', value: 2, chipped: true },
    { name: 'Gamble', stat: 'LUCK', value: 1 },
  ],
});
assert.ok(aliased);
assert.deepEqual(aliased.skills, [
  { name: 'Persuation & Fast Talk', stat: 'EMPATHY', value: 4, chipped: false },
  { name: 'Pharmacuticals', stat: 'TECH', value: 0, chipped: false },
  { name: 'Operate Hvy. Machinery', stat: 'REF', value: 100, chipped: false },
  { name: 'Streetwise', stat: 'COOL', value: 2, chipped: true },
  { name: 'Gamble', stat: 'OTHER', value: 1, chipped: false },
]);

// --- clamps and capacities ---

const clamped = sanitizeCyberpunkSheet({
  age: 5000,
  characterPoints: -1,
  rep: 5,
  currentIp: null,
  humanity: 40.8,
  money: -50,
  save: 2000,
  btm: -5,
  derived: { run: 3, leap: -1, carry: 1.5, lift: null },
  stats: { MA: 10, BODY: 10 },
  cybernetics: [{ type: 'Neuralware', hl: 1.5, cost: 500 }, { type: 'Kerenzikov', hl: 2, cost: 3 }],
  cyberneticsTotals: { hl: 1, euro: 9 },
  armor: { torso: 18.9 },
  weapons: [{ name: 'Poor', wa: -1 }, { name: 'Wild', wa: -100, rndCap: -4, rof: 3.2 }],
});
assert.ok(clamped);
assert.equal(clamped.age, 999);
assert.equal(clamped.characterPoints, 0);
assert.equal(clamped.rep, 5);
assert.equal(clamped.currentIp, null);
assert.equal(clamped.humanity, 40.8);
assert.equal(clamped.money, 0);
assert.equal(clamped.save, 1000);
assert.equal(clamped.btm, -5);
assert.equal(clamped.derived.run, 3);
assert.equal(clamped.derived.leap, 0);
assert.equal(clamped.derived.carry, 1.5);
assert.equal(clamped.derived.lift, null);
assert.equal(clamped.stats.MA, 10);
assert.notEqual(clamped.derived.run, 30);
assert.equal(clamped.cyberneticsTotals.hl, 1);
assert.equal(clamped.cyberneticsTotals.euro, 9);
assert.notEqual(clamped.cyberneticsTotals.hl, 3.5);
assert.equal(clamped.cybernetics[0].hl, 1.5);
assert.equal(clamped.armor.torso, 18);
assert.equal(clamped.weapons[0].wa, -1);
assert.equal(clamped.weapons[1].wa, -20);
assert.equal(clamped.weapons[1].rndCap, 0);
assert.equal(clamped.weapons[1].rof, 3);

const btmFloor = sanitizeCyberpunkSheet({ btm: -500 });
assert.equal(btmFloor?.btm, -100);
const btmCeil = sanitizeCyberpunkSheet({ btm: 500 });
assert.equal(btmCeil?.btm, 100);

function namedRows(count: number, name: string) {
  return Array.from({ length: count }, (_, i) => ({ name: `${name}${i}`, stat: 'REF', value: 1 }));
}
const overSkills = sanitizeCyberpunkSheet({
  skills: [null, [], 'nope', { name: '' }, { name: '   ' }, { nope: true }, ...namedRows(201, 'S')],
});
assert.ok(overSkills);
assert.equal(overSkills.skills.length, 200);
assert.equal(overSkills.skills[0].name, 'S0');
assert.equal(overSkills.skills[199].name, 'S199');
assert.ok(!overSkills.skills.some((skill) => skill.name === 'S200'));

const overGear = sanitizeCyberpunkSheet({
  gear: [null, {}, ...Array.from({ length: 101 }, (_, i) => ({ type: `G${i}`, cost: i, wt: null }))],
});
assert.equal(overGear?.gear.length, 100);
assert.equal(overGear?.gear[0].type, 'G0');
assert.equal(overGear?.gear[99].type, 'G99');

const overCyber = sanitizeCyberpunkSheet({
  cybernetics: [null, { hl: 'nope' }, ...Array.from({ length: 101 }, (_, i) => ({ type: `C${i}`, hl: null, cost: null }))],
});
assert.equal(overCyber?.cybernetics.length, 100);
assert.equal(overCyber?.cybernetics[99].type, 'C99');

const overWeapons = sanitizeCyberpunkSheet({
  weapons: [{}, ...Array.from({ length: 101 }, (_, i) => ({ name: `W${i}` }))],
});
assert.equal(overWeapons?.weapons.length, 100);
assert.equal(overWeapons?.weapons[0].name, 'W0');
assert.equal(overWeapons?.weapons[99].name, 'W99');

const overEvents = sanitizeCyberpunkSheet({
  lifepath: {
    lifeEvents: [null, {}, ...Array.from({ length: 101 }, (_, i) => ({ year: 2000 + i, event: `E${i}` }))],
  },
});
assert.equal(overEvents?.lifepath.lifeEvents.length, 100);
assert.equal(overEvents?.lifepath.lifeEvents[0].event, 'E0');
assert.equal(overEvents?.lifepath.lifeEvents[99].year, 2099);

// --- weapons, armor, wounds, omissions ---

const rows = sanitizeCyberpunkSheet({
  handle: '  Ada\nWong\u0000 ',
  role: '  Solo  ',
  drawingUrl: '  https://example.test/ada.png  ',
  specialAbilities: [
    { name: 'combat sense', value: 6 },
    { name: 'Backup', value: 9 },
    null,
    { name: 'Authority', value: null },
  ],
  armor: {
    Skull: 11,
    'R. Arm': 10,
    Hand: 4,
    nope: 9,
    lFoot: 2,
  },
  wounds: {
    LIGHT: [true, false, true, false, true],
    SERIOUS: 'x',
    'MORTAL 0': [true],
    MORTAL1: [false, true, false, false],
    CRITICAL: [true, 1, false, 'X'],
  },
  gear: [{ type: 'Rope', cost: 5, wt: 1, secret: true }],
  cybernetics: [{ type: 'Cybereye', hl: 2, cost: 500, note: 'left' }],
  weapons: [{
    name: 'Malorian',
    type: 'P',
    wa: 1,
    con: 'J',
    avail: 'P',
    dammage: '4d6',
    damage: 'NO',
    ammo: '10mm',
    rndCap: 8,
    rof: 2,
    rel: 'UR',
    extra: true,
  }],
  lifepath: {
    style: 'Street',
    affections: 'Rings',
    valuedPosession: 'Gun',
    familyBackground: 'Line\nTwo\u0001',
    siblings: repeat(80, '1'),
    lifeEvents: [{ year: 2013, event: 'Left home', note: 'nope' }, { event: '' }],
    unknown: 'x',
  },
  notAField: { hacked: true },
});
assert.ok(rows);
assert.equal(rows.handle, 'Ada Wong');
assert.equal(rows.role, 'Solo');
assert.equal(rows.drawingUrl, 'https://example.test/ada.png');
assert.equal(rows.specialAbilities.length, 10);
assert.equal(rows.specialAbilities[2].name, 'Combat Sense');
assert.equal(rows.specialAbilities[2].value, 6);
assert.equal(rows.specialAbilities[0].name, 'Authority');
assert.equal(rows.specialAbilities[0].value, null);
const abilityNames: string[] = rows.specialAbilities.map((ability) => ability.name);
assert.equal(abilityNames.includes('Backup'), false);
assert.equal(rows.armor.skull, 11);
assert.equal(rows.armor.rArm, 10);
assert.equal(rows.armor.rHand, null);
assert.equal(rows.armor.lHand, null);
assert.equal(rows.armor.lFoot, 2);
assert.deepEqual(rows.wounds.LIGHT, [true, false, true, false]);
assert.deepEqual(rows.wounds.SERIOUS, [false, false, false, false]);
assert.deepEqual(rows.wounds.MORTAL_0, [true, false, false, false]);
assert.deepEqual(rows.wounds.MORTAL_1, [false, true, false, false]);
assert.deepEqual(rows.wounds.CRITICAL, [true, false, false, false]);
assert.deepEqual(keysOf(rows.gear[0]), ['cost', 'type', 'wt']);
assert.deepEqual(keysOf(rows.cybernetics[0]), ['cost', 'hl', 'type']);
assert.deepEqual(keysOf(rows.weapons[0]), ['ammo', 'avail', 'con', 'dammage', 'name', 'rel', 'rndCap', 'rof', 'type', 'wa']);
assert.equal(rows.weapons[0].dammage, '4d6');
assert.equal(hasOwn(rows.weapons[0], 'damage'), false);
assert.equal(rows.lifepath.affections, 'Rings');
assert.equal(rows.lifepath.valuedPosession, 'Gun');
assert.equal(rows.lifepath.familyBackground, 'Line\nTwo');
assert.equal(rows.lifepath.siblings.length, 40);
assert.deepEqual(rows.lifepath.lifeEvents, [{ year: 2013, event: 'Left home' }]);
assert.equal(hasOwn(rows.lifepath, 'unknown'), false);
assert.equal(hasOwn(rows, 'notAField'), false);
assert.deepEqual(keysOf(rows), [...TOP_KEYS].sort());

const armorList = sanitizeCyberpunkSheet({
  armor: [{ location: 'torso', sp: 18 }, { key: 'lArm', sp: 4 }, 'bad', { location: 'Left Hand', value: 3 }],
});
assert.equal(armorList?.armor.torso, 18);
assert.equal(armorList?.armor.lArm, 4);
assert.equal(armorList?.armor.lHand, 3);

const partialWeapon = sanitizeCyberpunkSheet({ weapons: [{ wa: 0 }] });
assert.equal(partialWeapon?.weapons.length, 1);
assert.equal(partialWeapon?.weapons[0].wa, 0);
assert.equal(partialWeapon?.weapons[0].name, '');

// --- full v2 round trip ---

const populatedRaw = {
  handle: 'Johnny',
  role: 'Rocker',
  characterPoints: 55,
  age: 28,
  rep: 4,
  currentIp: 12,
  humanity: 64,
  money: 350.5,
  stats: { INT: 6, REF: null, TECH: 7, COOL: 9, ATTR: 8, LUCK: 5, MA: 6, BODY: 7, EMP: null },
  derived: { run: 12, leap: 3, carry: 80, lift: 200 },
  specialAbilities: CYBERPUNK_SPECIAL_ABILITIES.map((name, index) => ({ name, value: index === 1 ? 8 : null })),
  skills: [
    { name: 'Persuation & Fast Talk', stat: 'EMPATHY', value: 6, chipped: false },
    { name: 'Pharmacuticals', stat: 'TECH', value: null, chipped: true },
    { name: 'Operate Hvy. Machinery', stat: 'REF', value: 2, chipped: false },
  ],
  save: 7,
  btm: -2,
  wounds: Object.fromEntries(CYBERPUNK_WOUND_COLUMNS.map((column, index) => [column, [index === 0, false, false, false]])),
  armor: Object.fromEntries(CYBERPUNK_ARMOR_LOCATIONS.map((location) => [location, location === 'torso' ? 14 : null])),
  cybernetics: [{ type: 'Big Knucks', hl: 2.5, cost: 500 }],
  cyberneticsTotals: { hl: 2.5, euro: 500 },
  gear: [{ type: 'Mirror shades', cost: 5, wt: 0 }],
  weapons: [{ name: 'Malorian', type: 'P', wa: 1, con: 'J', avail: 'P', dammage: '4d6', ammo: '10mm', rndCap: 8, rof: 2, rel: 'UR' }],
  lifepath: {
    style: 'Rocker', clothes: 'Leather', hair: 'Black', affections: 'Rings', ethnicity: 'Night City',
    language: 'English', familyBackground: 'Band', siblings: '1', motivations: 'Fame', traits: 'Loud',
    valuedPerson: 'Alt', valueMost: 'Music', feelAboutPeople: 'Audience', valuedPosession: 'Guitar',
    lifeEvents: [{ year: 2013, event: 'First gig' }],
  },
  drawingUrl: 'https://example.test/johnny.png',
  ignored: true,
};
const populated = sanitizeCyberpunkSheet(populatedRaw);
assert.ok(populated);
assert.equal(populated.stats.REF, null);
assert.equal(populated.stats.EMP, null);
assert.equal(populated.stats.INT, 6);
assert.equal(populated.money, 350.5);
assert.equal(populated.btm, -2);
assert.equal(populated.derived.lift, 200);
assert.equal(populated.specialAbilities[1].value, 8);
assert.equal(populated.skills[1].chipped, true);
assert.equal(populated.skills[1].value, null);
assert.equal(populated.wounds.LIGHT[0], true);
assert.equal(populated.wounds.MORTAL_6[0], false);
assert.equal(populated.armor.torso, 14);
assert.equal(populated.armor.skull, null);
assert.equal(populated.cybernetics[0].hl, 2.5);
assert.equal(populated.gear[0].wt, 0);
assert.equal(populated.weapons[0].dammage, '4d6');
assert.equal(populated.weapons[0].rndCap, 8);
assert.equal(populated.lifepath.valuedPosession, 'Guitar');
assert.equal(populated.drawingUrl, 'https://example.test/johnny.png');
assert.deepEqual(readCyberpunkSheet(populated), populated);
assert.deepEqual(readCyberpunkSheet(JSON.stringify(populated)), populated);
assert.equal(hasOwn(populated, 'ignored'), false);

const before = structuredClone(populatedRaw);
sanitizeCyberpunkSheet(populatedRaw);
assert.deepEqual(populatedRaw, before);

// --- rejected payloads and bad reads ---

assert.equal(sanitizeCyberpunkSheet(null), null);
assert.equal(sanitizeCyberpunkSheet([]), null);
assert.equal(sanitizeCyberpunkSheet('sheet'), null);
assert.equal(sanitizeCyberpunkSheet(new Date()), null);
class Box { role = 'Solo'; }
assert.equal(sanitizeCyberpunkSheet(new Box()), null);
const dict = Object.create(null) as Record<string, unknown>;
dict.role = 'Nomad';
dict.stats = { REF: 7 };
const fromNullProto = sanitizeCyberpunkSheet(dict);
assert.equal(fromNullProto?.role, 'Nomad');
assert.equal(fromNullProto?.stats.REF, 7);
assert.equal(fromNullProto?.stats.INT, 5);

const polluted = JSON.parse('{"role":"Cop","__proto__":{"polluted":true},"constructor":{"prototype":{"pwned":true}}}') as Record<string, unknown>;
const cleaned = sanitizeCyberpunkSheet(polluted);
assert.equal(cleaned?.role, 'Cop');
assert.equal(({} as { polluted?: boolean }).polluted, undefined);
assert.equal(({} as { pwned?: boolean }).pwned, undefined);
assert.equal(hasOwn(cleaned as CyberpunkSheet, 'constructor'), false);

assert.deepEqual(readCyberpunkSheet(null), defaultCyberpunkSheet());
assert.deepEqual(readCyberpunkSheet('[]'), defaultCyberpunkSheet());
assert.deepEqual(readCyberpunkSheet('not json'), defaultCyberpunkSheet());
assert.deepEqual(readCyberpunkSheet([]), defaultCyberpunkSheet());
assert.deepEqual(keysOf(readCyberpunkSheet(undefined)), [...TOP_KEYS].sort());

// --- sizes ---

const defaultsBytes = Buffer.byteLength(JSON.stringify(defaultCyberpunkSheet()));
const officialSheet = defaultCyberpunkSheet();
officialSheet.skills = addOfficialCyberpunkSkills([]);
officialSheet.handle = 'Official';
officialSheet.role = 'Solo';
officialSheet.lifepath.familyBackground = repeat(400);
officialSheet.lifepath.motivations = repeat(400);
const officialBytes = Buffer.byteLength(JSON.stringify(officialSheet));
assert.ok(defaultsBytes < 64 * 1024, `default sheet is ${defaultsBytes} bytes`);
assert.ok(officialBytes < 64 * 1024, `official skill sheet is ${officialBytes} bytes`);

const maxPayload = {
  handle: repeat(CYBERPUNK_LIMITS.text.name),
  role: repeat(CYBERPUNK_LIMITS.text.name),
  drawingUrl: repeat(CYBERPUNK_LIMITS.text.drawingUrl),
  characterPoints: CYBERPUNK_LIMITS.counter.max,
  age: CYBERPUNK_LIMITS.age.max,
  rep: CYBERPUNK_LIMITS.counter.max,
  currentIp: CYBERPUNK_LIMITS.counter.max,
  humanity: CYBERPUNK_LIMITS.counter.max,
  money: CYBERPUNK_LIMITS.resource.max,
  stats: Object.fromEntries(CYBERPUNK_STATS.map((stat) => [stat, 10])),
  derived: Object.fromEntries(CYBERPUNK_DERIVED_KEYS.map((key) => [key, CYBERPUNK_LIMITS.resource.max])),
  specialAbilities: CYBERPUNK_SPECIAL_ABILITIES.map((name) => ({ name, value: 100 })),
  skills: Array.from({ length: CYBERPUNK_LIMITS.skills + 5 }, (_, i) => ({
    name: `${i}-${repeat(CYBERPUNK_LIMITS.text.name)}`,
    stat: 'OTHER',
    value: 100,
    chipped: true,
  })),
  save: CYBERPUNK_LIMITS.save.max,
  btm: CYBERPUNK_LIMITS.btm.min,
  wounds: Object.fromEntries(CYBERPUNK_WOUND_COLUMNS.map((column) => [column, [true, true, true, true, true]])),
  armor: Object.fromEntries(CYBERPUNK_ARMOR_LOCATIONS.map((location) => [location, CYBERPUNK_LIMITS.armor.max])),
  cybernetics: Array.from({ length: CYBERPUNK_LIMITS.cybernetics + 5 }, () => ({
    type: repeat(CYBERPUNK_LIMITS.text.line),
    hl: CYBERPUNK_LIMITS.humanityLoss.max,
    cost: CYBERPUNK_LIMITS.resource.max,
  })),
  cyberneticsTotals: { hl: CYBERPUNK_LIMITS.humanityLoss.max, euro: CYBERPUNK_LIMITS.resource.max },
  gear: Array.from({ length: CYBERPUNK_LIMITS.gear + 5 }, () => ({
    type: repeat(CYBERPUNK_LIMITS.text.line),
    cost: CYBERPUNK_LIMITS.resource.max,
    wt: CYBERPUNK_LIMITS.resource.max,
  })),
  weapons: Array.from({ length: CYBERPUNK_LIMITS.weapons + 5 }, () => ({
    name: repeat(CYBERPUNK_LIMITS.text.name),
    type: repeat(CYBERPUNK_LIMITS.text.short),
    wa: CYBERPUNK_LIMITS.wa.min,
    con: repeat(CYBERPUNK_LIMITS.text.short),
    avail: repeat(CYBERPUNK_LIMITS.text.short),
    dammage: repeat(CYBERPUNK_LIMITS.text.short),
    ammo: repeat(CYBERPUNK_LIMITS.text.short),
    rndCap: CYBERPUNK_LIMITS.counter.max,
    rof: CYBERPUNK_LIMITS.counter.max,
    rel: repeat(CYBERPUNK_LIMITS.text.short),
  })),
  lifepath: {
    ...Object.fromEntries(CYBERPUNK_LIFEPATH_FIELDS.map((field) => [field, repeat(field === 'siblings' ? 80 : 4000)])),
    lifeEvents: Array.from({ length: CYBERPUNK_LIMITS.lifeEvents + 5 }, (_, i) => ({
      year: 1900 + i,
      event: repeat(CYBERPUNK_LIMITS.text.event),
    })),
  },
};
const maxSheet = sanitizeCyberpunkSheet(maxPayload);
assert.ok(maxSheet);
assert.equal(maxSheet.skills.length, CYBERPUNK_LIMITS.skills);
assert.equal(maxSheet.gear.length, CYBERPUNK_LIMITS.gear);
assert.equal(maxSheet.cybernetics.length, CYBERPUNK_LIMITS.cybernetics);
assert.equal(maxSheet.weapons.length, CYBERPUNK_LIMITS.weapons);
assert.equal(maxSheet.lifepath.lifeEvents.length, CYBERPUNK_LIMITS.lifeEvents);
assert.equal(maxSheet.lifepath.familyBackground.length, CYBERPUNK_LIMITS.text.lifepathLong);
assert.equal(maxSheet.skills[0].name.length, CYBERPUNK_LIMITS.text.name);
const maxBytes = Buffer.byteLength(JSON.stringify(maxSheet));
assert.ok(maxBytes > 64 * 1024, `max sheet ${maxBytes} fits in 64 KiB; the raised cap is unexplained`);
assert.ok(maxBytes <= CYBERPUNK_SHEET_MAX_BYTES, `max sheet ${maxBytes} exceeds ${CYBERPUNK_SHEET_MAX_BYTES}`);

// --- create name ---

assert.deepEqual(parseCharacterCreateBody({ name: '  Ada  ', campaignId: 'c1', system: 'pf1e' }), {
  ok: true, name: 'Ada', campaignId: 'c1', system: 'pf1e',
});
assert.deepEqual(parseCharacterCreateBody({ name: 'Vault' }), { ok: true, name: 'Vault', campaignId: undefined, system: undefined });
assert.deepEqual(parseCharacterCreateBody({ name: repeat(100, 'A') }), { ok: true, name: repeat(100, 'A'), campaignId: undefined, system: undefined });
assert.deepEqual(parseCharacterCreateBody({}), { ok: false, error: 'Character name required' });
assert.deepEqual(parseCharacterCreateBody({ name: '   ' }), { ok: false, error: 'Character name required' });
assert.deepEqual(parseCharacterCreateBody({ name: '' }), { ok: false, error: 'Character name required' });
assert.deepEqual(parseCharacterCreateBody({ name: null }), { ok: false, error: 'Character name required' });
assert.deepEqual(parseCharacterCreateBody({ name: 12 }), { ok: false, error: 'Invalid character name' });
assert.deepEqual(parseCharacterCreateBody({ name: repeat(101, 'A') }), { ok: false, error: 'Invalid character name' });
assert.deepEqual(parseCharacterCreateBody([]), { ok: false, error: 'Invalid character name' });
assert.deepEqual(parseCharacterCreateBody(null), { ok: false, error: 'Invalid character name' });
assert.deepEqual(parseCharacterCreateBody('Ada'), { ok: false, error: 'Invalid character name' });
const nameDict = Object.create(null) as { name: string };
nameDict.name = 'Null Proto';
assert.equal(parseCharacterCreateBody(nameDict).ok, true);

console.log(`CYBERPUNK SHEET TESTS: PASS (default ${defaultsBytes} B, official ${officialBytes} B, max ${maxBytes} B, cap ${CYBERPUNK_SHEET_MAX_BYTES} B)`);

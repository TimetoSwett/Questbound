import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path, mocks = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  runInNewContext(js, { exports, URL, Buffer, require: name => name in mocks ? mocks[name] : require(name) });
  return exports;
}
const skillsValidation = load('lib/skills-validation.ts');
const psionics = load('lib/psionics.ts');
const pathOfWar = load('lib/path-of-war.ts');
const equipment = load('lib/equipment.ts');
const validation = load('lib/equipment-validation.ts', { './equipment': equipment });
const { equipmentEffects, equipmentSkillPenalty, weaponTotals, formatWeaponDamage, formatCrit, sizedDamage } = equipment;
const armor = { name: 'Mail', acBonus: 6, maxDex: 2, checkPenalty: -5, spellFailure: 30 };
const shield = { name: 'Shield', acBonus: 2, maxDex: 1, checkPenalty: -2, spellFailure: 15 };
const weapon = { name: 'Sword', attackBonus: 1, ability: 'str', damage: '1d8', damageBonus: 2, crit: '19-20/x2', range: 0, type: 'S' };
const effects = equipmentEffects({ armor, shield }, 99, 99, 4);
assert.equal(effects.armorBonus, 6); assert.equal(effects.shieldBonus, 2);
assert.equal(effects.dexToAC, 1); assert.equal(effects.checkPenalty, -7); assert.equal(effects.spellFailure, 45);
assert.equal(equipmentEffects({ armor, shield }, 0, 0, -3).dexToAC, -3);
assert.equal(equipmentEffects({}, 3, 4, 5).armorBonus, 3);
assert.equal(equipmentEffects({}, 3, 4, 5).shieldBonus, 4);
assert.equal(equipmentEffects({}, 3, 4, 5).dexToAC, 5);
assert.equal(equipmentEffects({ armor: { ...armor, name: '  ' } }, 3).armorBonus, 3);
assert.equal(equipmentEffects({ armor: { ...armor, maxDex: null } }, 0, 0, 5).dexToAC, 5);
assert.equal(equipmentEffects({ armor: { ...armor, maxDex: 0 } }, 0, 0, 5).dexToAC, 0);
for (const ability of ['STR', 'DEX', 'str']) assert.equal(equipmentSkillPenalty(ability, -7), -7);
for (const ability of ['INT', 'WIS', 'CHA', 'CON']) assert.equal(equipmentSkillPenalty(ability, -7), 0);
assert.equal(weaponTotals(weapon, 6, 3, 5, -1).attack, 9);
assert.equal(weaponTotals({ ...weapon, ability: 'dex' }, 6, 3, 5, 1).attack, 13);
assert.equal(weaponTotals(weapon, 6, 3, 5).damage, '1d8+5');
assert.equal(formatWeaponDamage({ ...weapon, damage: '1d4', damageBonus: 0 }, 6, 5, 0), '1d4+5');
assert.equal(formatWeaponDamage({ ...weapon, damage: '' }, 6, 5, 0), '\u2014');
assert.equal(formatCrit('19-20/x2'), '19\u201320/\u00d72');
assert.equal(formatCrit('x3'), '\u00d73');
assert.equal(formatCrit(''), '');
// Strength by hands
const plain = { ...weapon, damageBonus: 0 };
assert.equal(weaponTotals(plain, 0, 5, 0).damage, '1d8+5');
assert.equal(weaponTotals({ ...plain, hands: 'one' }, 0, 5, 0).damage, '1d8+5');
assert.equal(weaponTotals({ ...plain, hands: 'two' }, 0, 5, 0).damage, '1d8+7');
assert.equal(weaponTotals({ ...plain, hands: 'off' }, 0, 5, 0).damage, '1d8+2');
assert.equal(weaponTotals({ ...plain, hands: 'two' }, 0, -3, 0).damage, '1d8-3');
assert.equal(weaponTotals({ ...plain, hands: 'off' }, 0, -3, 0).damage, '1d8-3');
assert.equal(weaponTotals({ ...plain, hands: 'two', category: 'thrown' }, 0, 4, 0).damage, '1d8+6');
assert.equal(weaponTotals({ ...plain, hands: 'two', category: 'ranged' }, 0, 5, 0).damage, '1d8');
// Size steps
const medium = { ...plain, baseDie: 'medium' };
assert.equal(weaponTotals({ ...medium, damage: '1d4' }, 0, 0, 0, 0, 0, 0, 'Small').damage, '1d3');
assert.equal(weaponTotals(medium, 0, 0, 0, 0, 0, 0, 'Large').damage, '2d6');
// Legacy weapons (no baseDie) keep the die exactly as typed
assert.equal(weaponTotals({ ...plain, damage: '1d4' }, 0, 0, 0, 0, 0, 0, 'Small').damage, '1d4');
assert.equal(weaponTotals(plain, 0, 0, 0, 0, 0, 0, 'Large').damage, '1d8');
assert.equal(equipment.formatWeaponDamage(plain, 0, 2, 0, 0, 0, 0, 'Large'), '1d8+2');
assert.equal(equipment.formatWeaponDamage(medium, 0, 2, 0, 0, 0, 0, 'Large'), '2d6+2');
// New and library weapons get the flag
assert.equal(equipment.newWeapon().baseDie, 'medium');
const catalog = load('lib/catalog.ts');
assert.equal(catalog.weaponFromLibrary('Longsword', { damage: '1d8' }, {}).baseDie, 'medium');
// Validator: only 'medium' or absent
assert.equal(validation.equippedSchema.safeParse({ weapons: [{ ...weapon, baseDie: 'medium' }] }).success, true);
assert.equal(validation.equippedSchema.safeParse({ weapons: [weapon] }).success, true);
assert.equal(validation.equippedSchema.safeParse({ weapons: [{ ...weapon, baseDie: 'small' }] }).success, false);
assert.equal(validation.equippedSchema.safeParse({ weapons: [{ ...weapon, baseDie: true }] }).success, false);
assert.equal(sizedDamage('1d8', 'Medium'), '1d8');
assert.equal(sizedDamage('1d8', 'Small'), '1d6');
assert.equal(sizedDamage('2d6', 'Large'), '3d6');
assert.equal(sizedDamage('2d6', 'Small'), '1d10');
assert.equal(sizedDamage('1d6', 'Tiny'), '1d3');
assert.equal(sizedDamage('1d8', 'Colossal'), '6d6');
assert.equal(sizedDamage('3d6', 'Large'), '4d6');
assert.equal(sizedDamage('3d8', 'Small'), '2d8');
assert.equal(sizedDamage('1d7', 'Large'), '1d7');
assert.equal(sizedDamage('1d8', undefined), '1d8');
assert.equal(validation.equippedSchema.safeParse({ weapons: [{ ...weapon, hands: 'two' }] }).data.weapons[0].hands, 'two');
assert.equal(validation.equippedSchema.safeParse({ weapons: [{ ...weapon, hands: 'three' }] }).success, false);
assert.equal(weaponTotals({ ...weapon, damageBonus: 0 }, 0, -2, 0).damage, '1d8-2');
assert.equal(weaponTotals({ ...weapon, damageBonus: 0 }, 0, 0, 0).damage, '1d8');
for (const category of ['melee', 'thrown', 'composite']) {
  assert.equal(weaponTotals({ ...weapon, category, ability: 'dex' }, 6, 3, 5).damage, '1d8+5');
  assert.equal(weaponTotals({ ...weapon, category, damageBonus: 0 }, 0, -2, 0).damage, '1d8-2');
}
assert.equal(weaponTotals({ ...weapon, category: 'ranged' }, 6, 3, 5).damage, '1d8+2');
assert.equal(weaponTotals({ ...weapon, category: 'ranged', damageBonus: 0 }, 0, -2, 0).damage, '1d8');
for (const category of ['melee', 'ranged', 'thrown', 'composite']) assert.equal(validation.equippedSchema.safeParse({ weapons: [{ ...weapon, category }] }).success, true);
assert.equal(validation.equippedSchema.safeParse({ weapons: [{ ...weapon, category: 'invalid' }] }).success, false);
const legacy = validation.equippedSchema.parse({ weapons: [{ ...weapon, range: 60 }] }).weapons[0];
assert.equal(legacy.range, 60);
assert.equal(legacy.category, undefined);
assert.equal(JSON.stringify(legacy), JSON.stringify({ ...weapon, range: 60 }));
assert.equal(weaponTotals(legacy, 6, 3, 5).damage, '1d8+5');
for (const range of [undefined, 'ranged', -1, 1.5, 100001]) assert.equal(validation.equippedSchema.safeParse({ weapons: [{ ...weapon, range }] }).success, false);
assert.equal(validation.equippedSchema.safeParse({ weapons: [{ ...weapon, rangeFeet: 60 }] }).success, false);
const valid = { armor, shield, weapons: [weapon], slots: { head: { name: 'Hat' }, unslotted2: null } };
assert.equal(validation.equippedSchema.safeParse(valid).success, true);
const worn = equipment.equippedItemBonuses({
  slots: {
    headband: { name: 'Headband of Inspired Wisdom', bonuses: [{ kind: 'ability', ability: 'wis', amount: 2 }, { kind: 'skill', skill: 'Perception', amount: 2 }] },
    belt: { name: 'Belt', bonuses: [{ kind: 'ability', ability: 'wis', amount: 4 }] },
  },
  armor: { ...armor, name: '  ', bonuses: [{ kind: 'ability', ability: 'str', amount: 9 }] },
});
assert.equal(worn.ability.wis, 6);
assert.equal(worn.ability.str, 0);
assert.equal(worn.skills.Perception, 2);
assert.equal(equipment.bonusLabel({ kind: 'ability', ability: 'wis', amount: 2 }), 'Wisdom +2');
assert.equal(validation.equippedSchema.safeParse({ slots: { headband: { name: 'Headband', bonuses: [{ kind: 'ability', ability: 'wis', amount: 2 }] } } }).success, true);
assert.equal(validation.equippedSchema.safeParse({ slots: { headband: { name: 'Headband', bonuses: [{ kind: 'ability', ability: 'luck', amount: 2 }] } } }).success, false);
assert.equal(validation.equippedSchema.safeParse({ slots: { headband: { name: 'Headband', bonuses: [{ kind: 'spell', amount: 1 }, { kind: 'ac', bonus: 'deflection', amount: 1 }, { kind: 'save', save: 'will', amount: 2 }] } } }).success, true);
assert.equal(validation.equippedSchema.safeParse({ conditions: ['fatigued', 'bless'], buffs: [{ name: 'Shield of faith', on: true, bonuses: [{ kind: 'ac', bonus: 'deflection', amount: 2 }] }] }).success, true);
assert.equal(validation.equippedSchema.safeParse({ buffs: [{ name: 'Bad', on: true, bonuses: [{ kind: 'attack', amount: 99 }] }] }).success, false);
const conditions = load('lib/conditions.ts', { './equipment': equipment });
assert.equal(conditions.resolveToggles(['fatigued', 'exhausted']).ability.str, -6);
assert.equal(conditions.resolveToggles(['bless', 'heroism']).attack, 2);
assert.equal(conditions.resolveToggles(['bless', 'bane']).attack, 0);
assert.equal(conditions.resolveToggles(['heroism', 'haste']).attack, 3);
assert.equal(conditions.resolveToggles(['heroism', 'rage']).saves.will, 2);
assert.equal(conditions.resolveToggles(['haste']).saves.ref, 1);
assert.equal(conditions.resolveToggles(['haste']).saves.fort, 0);
assert.equal(conditions.resolveToggles(['sickened', 'shaken']).skillAll, -4);
assert.equal(conditions.resolveToggles(['grappled', 'pinned']).ability.dex, -4);
assert.equal(conditions.resolveToggles(['flat-footed']).loseDex, true);
assert.equal(conditions.resolveToggles(['rage', 'enlarge']).ability.str, 6);
const adjusted = conditions.sheetAdjustment({
  equipped: { slots: { headband: { name: 'Band', bonuses: [{ kind: 'ability', ability: 'wis', amount: 2 }] } }, conditions: ['sickened'], buffs: [{ name: 'Focus', on: true, bonuses: [{ kind: 'attack', amount: 1 }] }] },
  feats: [{ name: 'Alertness', bonuses: [{ kind: 'skill', skill: 'Perception', amount: 2 }] }, { name: ' ', bonuses: [{ kind: 'skill', skill: 'Perception', amount: 9 }] }],
});
assert.equal(adjusted.ability.wis, 2);
assert.equal(adjusted.skills.Perception, 2);
assert.equal(adjusted.attack, -1);
assert.equal(adjusted.damage, -2);
assert.equal(conditions.maneuverSize(1), -1);
assert.equal(conditions.maneuverSize(1, 1), 0);
assert.equal(conditions.maneuverSize(0, 1), 1);
assert.equal(conditions.resolveToggles(['enlarge']).sizeCmb, 1);
assert.equal(conditions.resolveToggles(['enlarge']).acPenalty, 0);
assert.equal(conditions.resolveToggles(['reduce']).sizeCmb, -1);
const belt = conditions.sheetAdjustment({ equipped: { conditions: ['rage'], slots: { belt: { name: 'Belt', bonuses: [{ kind: 'ability', ability: 'str', amount: 4, stack: 'enhancement' }, { kind: 'ability', ability: 'str', amount: 2, stack: 'enhancement' }] } } } });
assert.equal(belt.ability.str, 8);
assert.equal(validation.equippedSchema.safeParse({ sheet: { dodge: 1, naturalEnhancement: 2, initAbilities: ['int'], dr: [{ amount: 5, bypass: 'magic' }], resist: [{ energy: 'Fire', amount: 10 }], pins: { left: ['hp', 'ac'], right: ['attacks'] } }, weapons: [{ ...weapon, extraAbilities: ['int'] }] }).success, true);
assert.equal(validation.equippedSchema.safeParse({ sheet: { pins: { left: ['nope'] } } }).success, false);
assert.equal(validation.equippedSchema.safeParse({ sheet: { noScore: ['con', 'int'] } }).success, true);
assert.equal(validation.equippedSchema.safeParse({ sheet: { noScore: ['invalid'] } }).success, false);
assert.equal(validation.equippedSchema.safeParse({ sheet: { noScore: Array(7).fill('con') } }).success, false);
const carry = load('lib/carry.ts', {});
assert.equal(carry.carryLimits(10, 'Medium').light, 33);
assert.equal(carry.carryLimits(10, 'Medium').heavy, 100);
assert.equal(carry.carryLimits(10, 'Small').light, 24);
assert.equal(carry.loadBracket(40, carry.carryLimits(10, 'Medium')), 'Medium');
for (const invalid of [null, 'bad', { armor: { ...armor, name: 'x'.repeat(201) } }, { shield: { ...shield, spellFailure: 101 } }, { armor: { ...armor, checkPenalty: 1 } }, { armor: { ...armor, maxDex: Infinity } }, { weapons: Array(51).fill(weapon) }, { weapons: [{ ...weapon, ability: 'wis' }] }, { slots: { extra: { name: 'Bad' } } }, { slots: { head: { name: 'Hat', inventoryItemId: '' } } }]) assert.equal(validation.equippedSchema.safeParse(invalid).success, false);
let user = 'owner', role = 'player', writes = 0;
let carried = [{ id: 'item', campaignId: 'campaign', characterId: 'character' }];
const character = { id: 'character', campaignId: 'campaign', userId: 'owner', armorBonus: 3, shieldBonus: 4 };
const library = load('lib/library.ts', { zod: require('zod') });
const companions = load('lib/companions.ts', { zod: require('zod') });
const route = load('app/api/characters/route.ts', {
  '@/lib/spells-extras': load('lib/spells-extras.ts'),
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  '@/auth': { auth: async () => user ? { user: { id: user } } : null },
  '@/lib/campaign-helpers': { getUserRole: async () => role },
  '@/lib/battle-map': { removeCharacterTokens: () => null },
  '@/lib/equipment-validation': validation,
  '@/lib/skills-validation': skillsValidation,
  '@/lib/psionics': psionics,
  '@/lib/path-of-war': pathOfWar,
  '@/lib/equipment': equipment,
  '@/lib/companions': companions,
  '@/lib/library': { libraryIdsIn: library.libraryIdsIn, stripMissingLibraryIds: library.stripMissingLibraryIds },
  '@/lib/prisma': { prisma: {
    character: { findUnique: async () => character, update: async args => { writes++; return { ...character, ...args.data }; } },
    inventoryItem: { findMany: async args => carried.filter(item => args.where.id.in.includes(item.id) && item.campaignId === args.where.campaignId && item.characterId === args.where.characterId) },
    libraryEntry: { findMany: async () => [] },
  } },
});
const put = equipped => route.PUT(new Request('https://test/api', { method: 'PUT', body: JSON.stringify({ id: 'character', equipped }) }));
user = null; assert.equal((await put(valid)).status, 401);
user = 'other'; assert.equal((await put(valid)).status, 403);
user = 'owner'; assert.equal((await put({ weapons: Array(51).fill(weapon) })).status, 400);
const oversized = { slots: { head: { name: 'Hat', notes: 'é'.repeat(32768) } } };
assert.ok(JSON.stringify(oversized).length < 64 * 1024);
const tooLarge = await put(oversized);
assert.equal(tooLarge.status, 413);
assert.match((await tooLarge.json()).error, /64 KiB/);
assert.equal(writes, 0);
// At the byte limit, schema validation still runs (this payload has an unknown field).
const atLimit = { padding: 'x'.repeat(64 * 1024 - Buffer.byteLength(JSON.stringify({ padding: '' }))) };
assert.equal(Buffer.byteLength(JSON.stringify(atLimit)), 64 * 1024);
assert.equal((await put(atLimit)).status, 400);
assert.equal((await put({ padding: atLimit.padding + 'x' })).status, 413);
const linked = { ...valid, armor: { ...armor, inventoryItemId: 'item' } };
for (const invalidItem of [[], [{ id: 'item', campaignId: 'other', characterId: 'character' }], [{ id: 'item', campaignId: 'campaign', characterId: 'other' }], [{ id: 'item', campaignId: 'campaign', characterId: null }]]) {
  carried = invalidItem;
  const r = await put(linked); assert.equal(r.status, 200);
  const b = await r.json(); assert.equal(b.equipped.armor.inventoryItemId, null); assert.equal(b.equipped.armor.name, armor.name); assert.equal(b.armorBonus, 6);
}
assert.equal(writes, 4);
carried = [{ id: 'item', campaignId: 'campaign', characterId: 'character' }];
let res = await put(linked); assert.equal(res.status, 200);
let body = await res.json(); assert.equal(body.armorBonus, 6); assert.equal(body.shieldBonus, 2); assert.equal(body.equipped.armor.inventoryItemId, 'item');
res = await put({}); body = await res.json(); assert.equal(body.armorBonus, 3); assert.equal(body.shieldBonus, 4);
character.campaignId = null; res = await put(linked); assert.equal(res.status, 200); assert.equal((await res.json()).equipped.armor.inventoryItemId, null); assert.equal((await put(valid)).status, 200);
res = await put({ armor: { ...armor, libraryEntryId: 'missing', sourceUrl: 'https://www.aonprd.com/EquipmentArmorDisplay.aspx?ItemName=Mail' } });
body = await res.json();
assert.equal(res.status, 200);
assert.equal('libraryEntryId' in body.equipped.armor, false);
assert.equal(body.equipped.armor.name, armor.name);
assert.equal(body.equipped.armor.sourceUrl, 'https://www.aonprd.com/EquipmentArmorDisplay.aspx?ItemName=Mail');
for (const noScore of [['con', 'con', 'int', 'bad', ...equipment.ABILITIES], 'bad', null]) {
  res = await put({ sheet: { noScore } });
  assert.equal(res.status, 200);
  const flags = (await res.json()).equipped.sheet.noScore;
  assert.ok(flags.length <= 6);
  assert.equal(new Set(flags).size, flags.length);
  assert.ok(flags.every(ability => equipment.ABILITIES.includes(ability)));
  if (Array.isArray(noScore)) assert.equal(flags.join(','), 'con,int,str,dex,wis,cha');
  else assert.equal(flags.length, 0);
}
console.log('Equipment math, validation, authorization, inventory scoping and save synchronization tests passed.');

// Skill saves accept legacy rows and clamp malformed/new specialty data.
const oldSkill = { name: 'Craft', ranks: 2, classSkill: true, misc: -1 };
for (const skills of [[oldSkill], JSON.stringify([oldSkill])]) {
  const response = await route.PUT(new Request('https://test/api', { method: 'PUT', body: JSON.stringify({ id: 'character', skills }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse((await response.json()).skills), [oldSkill]);
}
const sanitizedResponse = await route.PUT(new Request('https://test/api', { method: 'PUT', body: JSON.stringify({ id: 'character', skills: [null, [], {}, {
  name: ' stale ', id: 'x'.repeat(120), base: 'Craft', specialty: 'Alchemy', ranks: 999.5, misc: -999,
  classSkill: true, ability: 'INT', extraAbility: '', custom: false, unknown: 'drop',
}] }) }));
assert.equal(sanitizedResponse.status, 200);
assert.deepEqual(JSON.parse((await sanitizedResponse.json()).skills), [{ name: 'Craft (Alchemy)', id: 'x'.repeat(100), base: 'Craft', specialty: 'Alchemy', ranks: 100, misc: -100, classSkill: true, ability: 'INT', extraAbility: '', custom: false }]);
const capped = skillsValidation.sanitizeSkills(Array.from({ length: 205 }, (_, index) => ({ name: 'Profession ' + index, ranks: -2, misc: 5.9, ability: 'bad', extraAbility: 'bad', specialty: 'x'.repeat(100) })));
assert.equal(capped.length, 200);
assert.equal(capped[0].ranks, 0);
assert.equal(capped[0].misc, 5);
assert.equal(capped[0].specialty.length, 60);
assert.equal(capped[0].ability, undefined);
assert.equal(capped[0].extraAbility, undefined);

const customSkills = skillsValidation.sanitizeSkills([
  { id: 'custom-1', custom: true, name: ' Sailing ', ability: 'invalid', ranks: 999, misc: -999, classSkill: true },
  { id: 'custom-2', custom: true, name: 'Navigation' },
  { id: 'custom-3', custom: true, name: 'Athletics', ability: 'STR' },
  { custom: true, name: '  ' },
  { custom: true },
]);
assert.deepEqual(JSON.parse(JSON.stringify(customSkills)), [
  { id: 'custom-1', custom: true, name: 'Sailing', ability: 'INT', ranks: 100, misc: -100, classSkill: true },
  { id: 'custom-2', custom: true, name: 'Navigation', ability: 'INT', ranks: 0, misc: 0, classSkill: false },
  { id: 'custom-3', custom: true, name: 'Athletics', ability: 'STR', ranks: 0, misc: 0, classSkill: false },
]);

assert.equal(skillsValidation.normalizeSkillName(' SteALTH '), 'stealth');
for (const entries of [
  [{ name: ' Sailing ', custom: true, ranks: 3 }, { name: 'sAILING', custom: true, ranks: 7 }],
  [{ name: ' stealth ', custom: true, ranks: 3 }, { name: 'Stealth', ranks: 7 }],
  [{ name: 'Stealth', ranks: 3 }, { name: ' stealth ', custom: true, ranks: 7 }],
  [{ name: 'Craft (Alchemy)', base: 'Craft', specialty: 'Alchemy', ranks: 3 },
    { name: 'Craft (alchemy)', base: 'Craft', specialty: 'alchemy', ranks: 7 }],
  [{ name: 'Craft', ranks: 3 }, { name: 'Craft', base: 'Craft', specialty: '', ranks: 7 }],
  [{ name: 'Craft', base: 'Craft', specialty: '', ranks: 3 }, { name: 'Craft', ranks: 7 }],
]) {
  const sanitized = skillsValidation.sanitizeSkills(entries);
  assert.equal(sanitized.length, 1);
  assert.equal(sanitized[0].ranks, 3);
}
assert.deepEqual(Array.from(skillsValidation.sanitizeSkills([
  { name: 'Craft', base: 'Craft', specialty: 'Alchemy' },
  { name: 'Craft', base: 'Craft', specialty: 'Bows' },
  { name: 'Profession', base: 'Profession', specialty: '' },
  { name: 'Craft', base: 'Craft', specialty: '' },
]), entry => entry.name), ['Craft (Alchemy)', 'Craft (Bows)', 'Profession', 'Craft']);

// Senses remain optional, strict, and normalized before PUT validation.
for (const senses of [{ darkvision: -1 }, { blindsight: 1.5 }, { scent: 'true' }, { custom: [''] }, { unknown: true }]) {
  assert.equal(validation.equippedSchema.safeParse({ sheet: { senses } }).success, false);
}
user = 'owner'; role = 'player';
const sensesResponse = await put({ sheet: { senses: {
  darkvision: 2000.9, blindsense: -10, blindsight: 30.9, tremorsense: '60',
  lowLight: true, scent: 'true', unknown: 'drop',
  custom: [null, '  ', '  echolocation  ', 'x'.repeat(100), ...Array(25).fill('sense')],
} } });
assert.equal(sensesResponse.status, 200);
const savedSenses = (await sensesResponse.json()).equipped.sheet.senses;
assert.deepEqual(savedSenses, {
  darkvision: 1000, blindsense: 0, blindsight: 30, lowLight: true,
  custom: ['echolocation', 'x'.repeat(80), ...Array(18).fill('sense')],
});
for (const senses of [null, [], 'bad', 10]) {
  const response = await put({ sheet: { senses } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).equipped.sheet.senses, undefined);
}

const { sanitizeSpellsExtras } = load('lib/spells-extras.ts');
const extras = { coins: { gp: 12 }, psionics: { x: 1 }, known: [], slots: {} };
const untouched = [extras.psionics, extras.known, extras.slots];
sanitizeSpellsExtras(extras);
assert.equal(JSON.stringify(extras.coins), JSON.stringify({ pp: 0, gp: 12, sp: 0, cp: 0 }));
assert.equal(extras.psionics, untouched[0]);
assert.equal(extras.known, untouched[1]);
assert.equal(extras.slots, untouched[2]);
for (const gp of [-1, 1.5, '2', 1e9 + 1, Infinity, NaN, null]) {
  const spells = { coins: { pp: 4, gp, sp: 1e9 } };
  sanitizeSpellsExtras(spells);
  assert.deepEqual(JSON.parse(JSON.stringify(spells.coins)), { pp: 4, gp: 0, sp: 1e9, cp: 0 });
}
for (const abilities of [null, {}, 'bad']) {
  const spells = { abilities };
  sanitizeSpellsExtras(spells);
  assert.equal('abilities' in spells, false);
}
const abilityExtras = { abilities: Array.from({ length: 110 }, (_, i) => ({
  ...(i === 2 ? {} : { id: 'duplicate' }), name: `  ${'x'.repeat(130)}  `,
  source: 'bad', reset: 'bad', max: 3, used: 20, extra: true,
})) };
sanitizeSpellsExtras(abilityExtras);
assert.equal(abilityExtras.abilities.length, 100);
assert.equal(new Set(abilityExtras.abilities.map(a => a.id)).size, 100);
assert.ok(abilityExtras.abilities.every(a => typeof a.id === 'string' && a.id.length > 0 && a.id.length <= 100));
assert.equal(abilityExtras.abilities[0].name, 'x'.repeat(120));
assert.equal(abilityExtras.abilities[0].source, 'class');
assert.equal(abilityExtras.abilities[0].reset, 'day');
assert.equal(abilityExtras.abilities[0].used, 3);
assert.equal('extra' in abilityExtras.abilities[0], false);
for (const coins of [null, [], 'bad', new Date()]) {
  const spells = { coins };
  sanitizeSpellsExtras(spells);
  assert.equal('coins' in spells, false);
}
const boundedAbilities = { abilities: [null, [], 'bad', new Date(),
  { id: 'valid', name: '  Feature  ', notes: 'n'.repeat(2100), source: 'item', reset: 'week', max: 1500.9, used: -2 },
  { id: '', max: '5', used: '2' },
  { id: 'x'.repeat(101), max: -3, used: 5 },
  { max: NaN, used: Infinity },
  { max: 3.9, used: 2.9 },
] };
sanitizeSpellsExtras(boundedAbilities);
assert.equal(boundedAbilities.abilities.length, 5);
const [bounded, defaults, negative, nonfinite, fractional] = boundedAbilities.abilities;
assert.equal(bounded.id, 'valid');
assert.equal(bounded.name, 'Feature');
assert.equal(bounded.notes.length, 2000);
assert.equal(bounded.source, 'item');
assert.equal(bounded.reset, 'week');
assert.equal(bounded.max, 1000);
assert.equal(bounded.used, 0);
assert.equal(defaults.max, 1);
assert.equal(defaults.used, 0);
assert.equal(negative.max, 0);
assert.equal(negative.used, 0);
assert.ok(negative.id.length <= 100);
assert.equal(nonfinite.max, 1);
assert.equal(nonfinite.used, 0);
assert.equal(fractional.max, 3);
assert.equal(fractional.used, 2);
console.log('Spells extras tests passed');
const oversizedSpells = await route.PUT(new Request('https://test/api', {
  method: 'PUT', body: JSON.stringify({ id: 'character', spells: { notes: 'é'.repeat(2 * 1024 * 1024) } }),
}));
assert.equal(oversizedSpells.status, 413);
assert.equal((await oversizedSpells.json()).error, 'Spells exceed the 4 MiB size limit');

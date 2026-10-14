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
const equipment = load('lib/equipment.ts');
const validation = load('lib/equipment-validation.ts', { './equipment': equipment });
const { equipmentEffects, equipmentSkillPenalty, weaponTotals } = equipment;
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
for (const invalid of [null, 'bad', { armor: { ...armor, name: 'x'.repeat(201) } }, { shield: { ...shield, spellFailure: 101 } }, { armor: { ...armor, checkPenalty: 1 } }, { armor: { ...armor, maxDex: Infinity } }, { weapons: Array(51).fill(weapon) }, { weapons: [{ ...weapon, ability: 'wis' }] }, { slots: { extra: { name: 'Bad' } } }, { slots: { head: { name: 'Hat', inventoryItemId: '' } } }]) assert.equal(validation.equippedSchema.safeParse(invalid).success, false);
let user = 'owner', role = 'player', writes = 0;
let carried = [{ id: 'item', campaignId: 'campaign', characterId: 'character' }];
const character = { id: 'character', campaignId: 'campaign', userId: 'owner', armorBonus: 3, shieldBonus: 4 };
const library = load('lib/library.ts', { zod: require('zod') });
const route = load('app/api/characters/route.ts', {
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  '@/auth': { auth: async () => user ? { user: { id: user } } : null },
  '@/lib/campaign-helpers': { getUserRole: async () => role },
  '@/lib/battle-map': { removeCharacterTokens: () => null },
  '@/lib/equipment-validation': validation,
  '@/lib/equipment': equipment,
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
console.log('Equipment math, validation, authorization, inventory scoping and save synchronization tests passed.');

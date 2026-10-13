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
  runInNewContext(js, { exports, URL, require: name => name in mocks ? mocks[name] : require(name) });
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
const valid = { armor, shield, weapons: [weapon], slots: { head: { name: 'Hat' }, unslotted2: null } };
assert.equal(validation.equippedSchema.safeParse(valid).success, true);
for (const invalid of [null, 'bad', { armor: { ...armor, name: 'x'.repeat(201) } }, { shield: { ...shield, spellFailure: 101 } }, { armor: { ...armor, checkPenalty: 1 } }, { armor: { ...armor, maxDex: Infinity } }, { weapons: Array(51).fill(weapon) }, { weapons: [{ ...weapon, ability: 'wis' }] }, { slots: { extra: { name: 'Bad' } } }, { slots: { head: { name: 'Hat', inventoryItemId: '' } } }]) assert.equal(validation.equippedSchema.safeParse(invalid).success, false);
let user = 'owner', role = 'player', writes = 0;
let carried = [{ id: 'item', campaignId: 'campaign', characterId: 'character' }];
const character = { id: 'character', campaignId: 'campaign', userId: 'owner', armorBonus: 3, shieldBonus: 4 };
const route = load('app/api/characters/route.ts', {
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  '@/auth': { auth: async () => user ? { user: { id: user } } : null },
  '@/lib/campaign-helpers': { getUserRole: async () => role },
  '@/lib/battle-map': { removeCharacterTokens: () => null },
  '@/lib/equipment-validation': validation,
  '@/lib/equipment': equipment,
  '@/lib/prisma': { prisma: {
    character: { findUnique: async () => character, update: async args => { writes++; return { ...character, ...args.data }; } },
    inventoryItem: { findMany: async args => carried.filter(item => args.where.id.in.includes(item.id) && item.campaignId === args.where.campaignId && item.characterId === args.where.characterId) },
  } },
});
const put = equipped => route.PUT(new Request('https://test/api', { method: 'PUT', body: JSON.stringify({ id: 'character', equipped }) }));
user = null; assert.equal((await put(valid)).status, 401);
user = 'other'; assert.equal((await put(valid)).status, 403);
user = 'owner'; assert.equal((await put({ weapons: Array(51).fill(weapon) })).status, 400);
const linked = { ...valid, armor: { ...armor, inventoryItemId: 'item' } };
for (const invalidItem of [[], [{ id: 'item', campaignId: 'other', characterId: 'character' }], [{ id: 'item', campaignId: 'campaign', characterId: 'other' }], [{ id: 'item', campaignId: 'campaign', characterId: null }]]) {
  carried = invalidItem; assert.equal((await put(linked)).status, 400);
}
assert.equal(writes, 0);
carried = [{ id: 'item', campaignId: 'campaign', characterId: 'character' }];
let res = await put(linked); assert.equal(res.status, 200);
let body = await res.json(); assert.equal(body.armorBonus, 6); assert.equal(body.shieldBonus, 2); assert.equal(body.equipped.armor.inventoryItemId, 'item');
res = await put({}); body = await res.json(); assert.equal(body.armorBonus, 3); assert.equal(body.shieldBonus, 4);
character.campaignId = null; assert.equal((await put(linked)).status, 400); assert.equal((await put(valid)).status, 200);
console.log('Equipment math, validation, authorization, inventory scoping and save synchronization tests passed.');

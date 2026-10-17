#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = new URL('../', import.meta.url);
function load(path) {
  const source = readFileSync(new URL(path, root), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const local = (name) => {
    if (name === './aon-spell-parser' || name.endsWith('/aon-spell-parser')) return load('lib/aon-spell-parser.ts');
    if (name === './library' || name.endsWith('/library')) return load('lib/library.ts');
    if (name === 'zod') return require('zod');
    return require(name);
  };
  runInNewContext(js, { exports, console, URL, require: local });
  return exports;
}
const parser = load('lib/aon-catalog-parser.ts');
const lib = load('lib/library.ts');
const page = (inner) => `<span id="MainContent_DataListTypes_LabelName_0">${inner}</span>`;

const feat = parser.parseAonCatalogPage(page('<h1 class="title">Power Attack (Combat)</h1><b>Source</b> Core Rulebook<br />You can make deadly attacks.<br /><b>Prerequisites</b>: Str 13.<br /><b>Benefit</b>: Take a penalty to gain damage.<h2>Mythic</h2>nope'), 'https://www.aonprd.com/FeatDisplay.aspx?ItemName=Power%20Attack');
assert.equal(feat.kind, 'feat');
assert.equal(feat.name, 'Power Attack');
assert.equal(feat.data.featType, 'Combat');
assert.equal(feat.data.prerequisites, 'Str 13.');
assert.match(feat.data.description, /deadly attacks/);
assert.doesNotMatch(feat.data.description, /Mythic/);
assert.equal(lib.parseCreateInput(feat).ok, true);

const weapon = parser.parseAonCatalogPage(page('<h1 class="title">Longsword</h1><b>Cost</b> 15 gp <b>Weight</b> 4 lbs.<br /><b>Damage</b> 1d6 (small), 1d8 (medium); <b>Critical</b> 19-20/x2; <b>Range</b> —; <b>Type</b> S<br /><b>Category</b> One-Handed<h3>Description</h3>A straight sword.'), 'https://www.aonprd.com/EquipmentWeaponsDisplay.aspx?ItemName=Longsword');
assert.equal(weapon.data.damage, '1d8');
assert.equal(weapon.data.crit, '19-20/x2');
assert.equal(weapon.data.category, 'melee');
assert.equal(weapon.data.ability, 'str');
assert.equal(weapon.data.weight, 4);
assert.equal(weapon.data.range, 0);
assert.equal(lib.parseCreateInput(weapon).ok, true);

const thrown = parser.parseAonCatalogPage(page('<h1>Dagger</h1><b>Damage</b> 1d4 (medium); <b>Range</b> 10 ft.; <b>Weight</b> 1/2 lb. <b>Category</b> Light'), 'https://aonprd.com/EquipmentWeaponsDisplay.aspx?ItemName=Dagger');
assert.equal(thrown.data.category, 'thrown');
assert.equal(thrown.data.range, 10);
assert.equal(thrown.data.weight, 0.5);

const armor = parser.parseAonCatalogPage(page('<h1>Buckler</h1><b>Cost</b> 5 gp <b>Weight</b> 5 lbs.<br /><b>Armor Bonus</b> +1; <b>Max Dex Bonus</b> —; <b>Armor Check Penalty</b> 0<br /><b>Arcane Spell Failure Chance</b> 5%<br /><b>Category</b> Shield'), 'https://www.aonprd.com/EquipmentArmorDisplay.aspx?ItemName=Buckler');
assert.equal(armor.data.slot, 'shield');
assert.equal(armor.data.acBonus, 1);
assert.equal(armor.data.maxDex, null);
assert.equal(armor.data.spellFailure, 5);
assert.equal(lib.parseCreateInput(armor).ok, true);

const gear = parser.parseAonCatalogPage(page('<h1>Backpack</h1><b>Price</b> 2 gp; <b>Weight</b> 2 lbs.<h3>Description</h3>Holds gear.'), 'https://www.aonprd.com/EquipmentMiscDisplay.aspx?ItemName=Backpack');
assert.equal(gear.kind, 'gear');
assert.equal(gear.data.cost, '2 gp');
assert.equal(lib.parseCreateInput(gear).ok, true);

const wondrous = parser.parseAonCatalogPage(page('<h1 class="title">Headband of Inspired Wisdom</h1><b>Source</b> Core Rulebook<br /><b>Aura</b> moderate transmutation; <b>CL</b> 8th<br /><b>Slot</b> headband; <b>Price</b> 4,000 gp (<img src="x.gif"> +2), 16,000 gp (+4), 36,000 gp (+6); <b>Weight</b> 1 lb.<h3 class="framing">Description</h3>This simple bronze headband is decorated with etchings. It grants Wisdom.<h3 class="framing">Construction</h3><b>Requirements</b> Craft Wondrous Item; <b>Cost</b> 2,000 gp'), 'https://aonprd.com/MagicWondrousDisplay.aspx?FinalName=Headband%20of%20Inspired%20Wisdom2');
assert.equal(wondrous.kind, 'gear');
assert.equal(wondrous.name, 'Headband of Inspired Wisdom');
assert.equal(wondrous.data.weight, 1);
assert.equal(wondrous.data.cost, '4,000 gp (+2), 16,000 gp (+4), 36,000 gp (+6)');
assert.match(wondrous.data.description, /Slot headband/);
assert.match(wondrous.data.description, /bronze headband/);
assert.match(wondrous.data.description, /Construction/);
assert.match(wondrous.summary, /bronze headband/);
assert.doesNotMatch(wondrous.summary, /Source/);
assert.equal(lib.parseCreateInput(wondrous).ok, true);

const ability = parser.parseAonCatalogPage(page('<h1>Grab (Ex)</h1>If the creature hits, it grapples.'), 'https://www.aonprd.com/UMR.aspx?ItemName=Grab');
assert.equal(ability.kind, 'ability');
assert.equal(ability.name, 'Grab (Ex)');
assert.match(ability.data.description, /grapples/);

assert.equal(parser.catalogKindForUrl('https://www.aonprd.com/MonsterDisplay.aspx?ItemName=Goblin'), null);
assert.throws(() => parser.parseAonCatalogPage(page('<h1>Goblin</h1>'), 'https://www.aonprd.com/MonsterDisplay.aspx?ItemName=Goblin'), /not a feat/);

const where = lib.searchWhere(lib.searchQuerySchema.parse({ kind: 'armor', slot: 'shield' }));
assert.deepEqual(JSON.parse(JSON.stringify(where.base.AND)), [{ data: { path: ['slot'], equals: 'shield' } }]);
const sheet = { feats: [{ name: 'A', libraryEntryId: 'keep' }, { name: 'B', libraryEntryId: 'drop' }], equipment: [{ libraryEntryId: 'nope' }] };
assert.deepEqual(JSON.parse(JSON.stringify(lib.libraryIdsIn(sheet).sort())), ['drop', 'keep', 'nope']);
lib.stripMissingLibraryIds(sheet, new Set(['keep']));
assert.equal(sheet.feats[0].libraryEntryId, 'keep');
assert.equal('libraryEntryId' in sheet.feats[1], false);
assert.equal('libraryEntryId' in sheet.equipment[0], false);
const { weaponFromLibrary } = load('lib/catalog.ts');
const twoHanded = weaponFromLibrary('Sword', { ...weapon.data, hands: 'two' }, {});
assert.equal(twoHanded.hands, 'two');
assert.equal(twoHanded.baseDie, 'medium');
const noHandsData = { ...weapon.data };
delete noHandsData.hands;
const noHands = weaponFromLibrary('Sword', noHandsData, {});
assert.equal('hands' in noHands, false);
assert.equal(noHands.baseDie, 'medium');
console.log('CATALOG TESTS: PASS');

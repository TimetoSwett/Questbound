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
    if (['./library-feat-form', './library-ability-form', './library-gear-form', './catalog'].includes(name)) return load(`lib/${name.slice(2)}.ts`);
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
for (const key of ['slot', 'aura', 'cl']) assert.equal(key in gear.data, false);
assert.equal(gear.data.cost, '2 gp');
assert.equal(lib.parseCreateInput(gear).ok, true);

const wondrous = parser.parseAonCatalogPage(page('<h1 class="title">Headband of Inspired Wisdom</h1><b>Source</b> Core Rulebook<br /><b>Aura</b> moderate transmutation; <b>CL</b> 8th<br /><b>Slot</b> headband; <b>Price</b> 4,000 gp (<img src="x.gif"> +2), 16,000 gp (+4), 36,000 gp (+6); <b>Weight</b> 1 lb.<h3 class="framing">Description</h3>This simple bronze headband is decorated with etchings. It grants Wisdom.<h3 class="framing">Construction</h3><b>Requirements</b> Craft Wondrous Item; <b>Cost</b> 2,000 gp'), 'https://aonprd.com/MagicWondrousDisplay.aspx?FinalName=Headband%20of%20Inspired%20Wisdom2');
assert.equal(wondrous.kind, 'gear');
assert.equal(wondrous.data.slot, 'headband');
assert.equal(wondrous.data.aura, 'moderate transmutation');
assert.equal(wondrous.data.cl, 8);
assert.equal(wondrous.name, 'Headband of Inspired Wisdom');
assert.equal(wondrous.data.weight, 1);
assert.equal(wondrous.data.cost, '4,000 gp (+2), 16,000 gp (+4), 36,000 gp (+6)');
assert.match(wondrous.data.description, /Slot headband/);
assert.match(wondrous.data.description, /bronze headband/);
assert.match(wondrous.data.description, /Construction/);
assert.match(wondrous.summary, /bronze headband/);
assert.doesNotMatch(wondrous.summary, /Source/);
assert.equal(lib.parseCreateInput(wondrous).ok, true);

assert.equal(parser.catalogKindForUrl('https://aonprd.com/MagicRingsDisplay.aspx?FinalName=Ring%20of%20Protection%20%2B1'), null);
const slotless = parser.parseAonCatalogPage(page('<h1 class="title">Ioun Stone (Dusty Rose Prism)</h1><b>Source</b> Core Rulebook<br /><b>Aura</b> moderate insight; <b>CL</b> 12th<br /><b>Slot</b> none; <b>Price</b> 5,000 gp; <b>Weight</b> —<h3 class="framing">Description</h3>This dusty rose prism grants a bonus to AC.'), 'https://aonprd.com/MagicWondrousDisplay.aspx?FinalName=Ioun%20StoneDusty%20Rose%20Prism');
assert.equal(slotless.data.slot, 'slotless');
assert.equal(slotless.data.aura, 'moderate insight');
assert.equal(slotless.data.cl, 12);
assert.equal(lib.parseCreateInput(slotless).ok, true);

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
const { weaponFromLibrary, featFromLibrary, gearFromLibrary } = load('lib/catalog.ts');
const mappedGear = gearFromLibrary(wondrous.name, wondrous.data, {});
assert.equal(mappedGear.slot, 'headband');
assert.equal(mappedGear.aura, 'moderate transmutation');
assert.equal(mappedGear.cl, 8);
const legacyGear = gearFromLibrary(gear.name, gear.data, {});
for (const key of ['slot', 'aura', 'cl']) assert.equal(key in legacyGear, false);
assert.equal(gearFromLibrary('Zero', { ...gear.data, cl: 0 }, {}).cl, 0);
const twoHanded = weaponFromLibrary('Sword', { ...weapon.data, hands: 'two' }, {});
assert.equal(twoHanded.hands, 'two');
assert.equal(twoHanded.baseDie, 'medium');
const noHandsData = { ...weapon.data };
delete noHandsData.hands;
const noHands = weaponFromLibrary('Sword', noHandsData, {});
assert.equal('hands' in noHands, false);
assert.equal(noHands.baseDie, 'medium');
const storedAbility = featFromLibrary('X', { tag: 'su', uses: ' 3/day ', description: 'Text (Ex)' }, {});
assert.equal(storedAbility.tag, 'su');
assert.equal(storedAbility.uses, '3/day');
assert.equal(featFromLibrary('X', { description: 'Text (Ex)' }, {}).tag, 'ex');
assert.equal(featFromLibrary('X', { tag: 'xx', description: 'Text (Ex)' }, {}).tag, 'ex');
assert.equal('uses' in featFromLibrary('X', { uses: ' ', description: 'd' }, {}), false);
const mappedFeat = featFromLibrary('Power Attack', {
  featType: ' Combat ', prerequisites: ' Str 13 ', benefit: ' Extra damage. ', description: 'Separate text (Ex).',
}, { libraryEntryId: 'feat-id', sourceUrl: 'https://example.com/feat' });
assert.equal(mappedFeat.featType, 'Combat');
assert.equal(mappedFeat.prerequisites, 'Str 13');
assert.equal(mappedFeat.benefit, 'Extra damage.');
assert.equal(mappedFeat.description, 'Prerequisites: Str 13\n\nBenefit: Extra damage.\n\nSeparate text (Ex).');
assert.equal(mappedFeat.tag, 'ex');
assert.equal(mappedFeat.libraryEntryId, 'feat-id');
assert.equal(mappedFeat.sourceUrl, 'https://example.com/feat');
const sameBenefit = featFromLibrary('X', { featType: '', prerequisites: '', benefit: ' Bonus ', description: 'Bonus' }, {});
assert.equal(sameBenefit.description, 'Benefit: Bonus');
const emptyFields = featFromLibrary('X', { featType: ' ', prerequisites: ' ', benefit: ' ', description: ' Original text ' }, {});
for (const key of ['featType', 'prerequisites', 'benefit']) assert.equal(key in emptyFields, false);
assert.equal(emptyFields.description, ' Original text ');
assert.equal(featFromLibrary('X', { description: 'x'.repeat(6000) }, {}).description.length, 6000);
console.log('CATALOG TESTS: PASS');

{
  const f = featFromLibrary('Power Attack', { featType: 'Combat', prerequisites: 'Str 13', benefit: 'Take a penalty.', description: 'You can make deadly attacks. Benefit: Take a penalty.' }, {});
  assert.equal((f.description.match(/Take a penalty/g) ?? []).length, 1);
}
console.log('CATALOG FEAT DEDUPE: PASS');

const forms = load('lib/sheet-entry-forms.ts');
const { featDescription, gearItemFields } = load('lib/catalog.ts');
const featData = { featType: 'Combat', prerequisites: 'Str 13', benefit: 'Extra damage.', description: 'Separate text.' };
assert.equal(featDescription(featData), featFromLibrary('X', featData, {}).description);
const featPatch = forms.featPatchFromForm(featData);
assert.equal(featPatch.ok, true);
assert.equal(forms.featCardBody(featPatch.patch), featFromLibrary('X', featData, {}).description);
assert.equal(forms.featFormFromEntry(mappedFeat).description, mappedFeat.description);
assert.equal(forms.featCardBody({ ...mappedFeat, summary: 'Summary' }), 'Summary');
const clearedFeat = forms.featPatchFromForm({ featType: '', prerequisites: '', benefit: '', description: '' });
assert.equal(clearedFeat.ok, true);
for (const key of ['featType', 'prerequisites', 'benefit', 'summary']) {
  assert.equal(Object.hasOwn(clearedFeat.patch, key), true);
  assert.equal(clearedFeat.patch[key], undefined);
}
assert.equal(forms.featPatchFromForm({ ...featData, featType: 'x'.repeat(81) }).ok, false);
const abilityPatch = forms.abilityPatchFromForm({ tag: 'su', uses: ' 3/day ', description: ' Magic ' });
assert.equal(abilityPatch.ok, true);
assert.equal(abilityPatch.patch.tag, 'su');
assert.equal(abilityPatch.patch.uses, '3/day');
assert.equal(abilityPatch.patch.description, 'Magic');
assert.equal(forms.abilityMeta(abilityPatch.patch), 'Supernatural (Su) · 3/day');
assert.equal(forms.abilityMeta({}), 'Special ability');
const clearedAbility = forms.abilityPatchFromForm({ tag: '', uses: '', description: '' });
assert.equal(clearedAbility.patch.tag, undefined);
assert.equal(clearedAbility.patch.uses, undefined);
assert.equal(forms.abilityFormFromEntry(abilityPatch.patch).uses, '3/day');
const gearForm = { slot: 'headband', aura: 'moderate transmutation', cl: '8', cost: '4000 gp', weight: '1', description: 'Wisdom.' };
const gearPatch = forms.gearPatchFromForm(gearForm);
assert.equal(gearPatch.ok, true);
assert.equal(gearPatch.patch.value, '4000 gp');
assert.equal(gearPatch.patch.notes, 'Wisdom.');
assert.equal(gearPatch.patch.cl, 8);
assert.equal(forms.gearPatchFromForm({ ...gearForm, cl: '31' }).ok, false);
const gearData = { ...gearForm, weight: 1, cl: 8 };
const gearMapped = gearFromLibrary('Headband', gearData, {});
for (const key of ['weight', 'value', 'notes', 'slot', 'aura', 'cl']) {
  assert.equal(gearPatch.patch[key], gearMapped[key]);
  assert.equal(gearItemFields(gearData)[key], gearMapped[key]);
}
assert.equal(forms.gearMetaExtras(gearPatch.patch), 'Headband · moderate transmutation · CL 8');
assert.equal(forms.gearMetaExtras({ cl: 0 }), 'CL 0');
assert.equal(forms.gearMetaExtras({}), '');
assert.equal(forms.gearFormFromItem(gearPatch.patch).cost, '4000 gp');
const clearedGear = forms.gearPatchFromForm({ slot: '', aura: '', cl: '', cost: '', weight: '', description: '' });
for (const key of ['slot', 'aura', 'cl']) {
  assert.equal(Object.hasOwn(clearedGear.patch, key), true);
  assert.equal(clearedGear.patch[key], undefined);
}
console.log('SHEET ENTRY FORMS: PASS');
{
  // A library feat whose link was cleared (name edited) keeps its already-built text instead of repeating prerequisites.
  const unlinked = { ...featFromLibrary('Power Attack', { featType: 'Combat', prerequisites: 'Str 13', benefit: '', description: 'Trade accuracy for damage.' }, {}), libraryEntryId: undefined };
  assert.equal(forms.featCardBody(unlinked), unlinked.description);
  assert.equal((forms.featCardBody(unlinked).match(/Prerequisites/g) ?? []).length, 1);
}
console.log('SHEET FEAT BODY: PASS');

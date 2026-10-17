#!/usr/bin/env -S npx tsx
// d20pfsrd.com spell + feat parser tests (offline, saved fixtures under scripts/fixtures/d20pfsrd).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const D = await import('../lib/d20pfsrd-parser.ts');
const L = await import('../lib/library.ts');
const fx = (f) => readFileSync(new URL(`./fixtures/d20pfsrd/${f}`, import.meta.url), 'utf8');
const U = {
  fireball: 'https://www.d20pfsrd.com/magic/all-spells/f/fireball/',
  clw: 'https://www.d20pfsrd.com/magic/all-spells/c/cure-light-wounds/',
  ball: 'https://www.d20pfsrd.com/magic/3rd-party-spells/4-winds-fantasy-gaming-3rd-party-spells/ball-of-air/',
  pa: 'https://www.d20pfsrd.com/feats/combat-feats/power-attack-combat/',
  twf: 'https://www.d20pfsrd.com/feats/combat-feats/two-weapon-fighting-combat/',
  wf: 'https://www.d20pfsrd.com/feats/combat-feats/weapon-focus-combat/',
  cs: 'https://www.d20pfsrd.com/feats/3rd-party-feats/alluria-publishing/charging-shot-combat/',
  bag: 'https://www.d20pfsrd.com/magic-items/wondrous-items/a-b/bag-of-holding/',
  headband: 'https://www.d20pfsrd.com/magic-items/wondrous-items/h-i/headband-of-vast-intelligence/',
  rop: 'https://www.d20pfsrd.com/magic-items/rings/ring-of-protection/',
  crypt: 'https://www.d20pfsrd.com/magic-items/rods/crypt-rod/',
  staff: 'https://www.d20pfsrd.com/magic-items/staves/staff-of-fire/',
  shepherd: 'https://www.d20pfsrd.com/magic-items/3rd-party-magic-items/3rd-party-rings/4-winds-fantasy-gaming/ring-of-the-shepherd/',
  pubo: 'https://www.d20pfsrd.com/magic-items/3rd-party-magic-items/3rd-party-wondrous-items/4-winds-fantasy-gaming/pubo-stone/',
  goblin: 'https://www.d20pfsrd.com/bestiary/monster-listings/humanoids/goblin/',
};
const lvl = (d, cls) => d.spellLevels.find((x) => x.cls === cls)?.level;
let count = 0;

// Every parsed draft must pass the real create validation, with clean text.
function check(d) {
  const r = L.parseCreateInput(d);
  assert.equal(r.ok, true, r.ok ? '' : JSON.stringify(r.error));
  assert.equal(r.value.kind, d.kind); assert.equal(r.value.system, 'pf1e');
  assert.equal(r.value.sourceUrl, d.sourceUrl); assert.equal(r.value.name, d.name); assert.ok(r.value.summary);
  if (d.kind === 'spell') { L.spellDataSchema.parse(d.data); L.spellLevelsSchema.parse(d.spellLevels); assert.deepEqual(r.value.spellLevels, d.spellLevels); }
  else if (d.kind === 'gear') { L.gearDataSchema.parse(d.data); assert.equal(d.spellLevels, undefined); assert.deepEqual(Object.keys(d.data).filter((k) => !['weight', 'cost', 'description', 'slot', 'aura', 'cl'].includes(k)), []); }
  else { L.featDataSchema.parse(d.data); assert.equal(d.spellLevels, undefined); }
  for (const s of [d.name, d.summary, ...Object.values(d.data).flat()].filter((x) => typeof x === 'string')) {
    assert.ok(!/<\/?[a-z][^>]*>/i.test(s), `HTML left in: ${s.slice(0, 80)}`);
    assert.ok(!/Section 15|Copyright/i.test(s), 'copyright text left');
    assert.ok(!/&(#\d+|[a-z]+);/i.test(s), 'undecoded entity');
  }
  assert.ok(!d.summary.includes('\n'));
}
const spell = (f, u) => { const d = D.parseD20pfsrdPage(fx(f), u); check(d); assert.equal(d.kind, 'spell'); return d; };
const feat = (f, u) => { const d = D.parseD20pfsrdPage(fx(f), u); check(d); assert.equal(d.kind, 'feat'); return d; };
const gear = (f, u) => { const d = D.parseD20pfsrdPage(fx(f), u); check(d); assert.equal(d.kind, 'gear'); assert.ok(!/FAQ|Errata|Editor|Section 15|Copyright|<|&#/i.test(d.data.description), 'no chrome in description'); return d; };
const ok = (m) => { count++; console.log(`ok   ${m}`); };

// spells
const fb = spell('fireball.html', U.fireball);
assert.equal(fb.name, 'Fireball'); assert.equal(fb.sourceUrl, U.fireball);
assert.equal(fb.data.school, 'evocation'); assert.equal(fb.data.subschool, ''); assert.deepEqual(fb.data.descriptors, ['fire']);
assert.equal(lvl(fb, 'sorcerer'), 3); assert.equal(lvl(fb, 'wizard'), 3); assert.equal(lvl(fb, 'magus'), 3); assert.equal(lvl(fb, 'bloodrager'), 3);
assert.equal(fb.spellLevels.length, 4, 'domain/bloodline/mystery/school entries are not classes');
for (const bad of ['fire', 'efreeti', 'flame']) assert.equal(lvl(fb, bad), undefined);
assert.equal(fb.data.castingTime, '1 standard action');
assert.equal(fb.data.components, 'V, S, M (a ball of bat guano and sulfur)');
assert.equal(fb.data.range, 'long (400 ft. + 40 ft./level)');
assert.equal(fb.data.areaTargetEffect, 'Area: 20-ft.-radius spread');
assert.equal(fb.data.duration, 'instantaneous'); assert.equal(fb.data.savingThrow, 'Reflex half'); assert.equal(fb.data.spellResistance, 'yes');
assert.ok(fb.data.description.startsWith('A fireball spell generates'));
assert.ok(fb.data.description.includes('\n\n'));
assert.ok(!/Mythic|Augmented/.test(fb.data.description));
assert.ok(!/School|Casting Time|CASTING|DESCRIPTION/.test(fb.data.description), 'section markers are not text');
assert.ok(fb.summary.startsWith('A fireball spell generates'));
ok('fireball');

const clw = spell('cure-light-wounds.html', U.clw);
assert.equal(clw.name, 'Cure Light Wounds');
assert.equal(clw.data.school, 'conjuration'); assert.equal(clw.data.subschool, 'healing'); assert.deepEqual(clw.data.descriptors, []);
assert.equal(lvl(clw, 'cleric'), 1); assert.equal(lvl(clw, 'oracle'), 1); assert.equal(lvl(clw, 'ranger'), 2); assert.equal(lvl(clw, 'alchemist'), 1);
assert.equal(lvl(clw, 'healing'), undefined);
assert.equal(clw.data.range, 'touch');
assert.equal(clw.data.areaTargetEffect, 'Target: creature touched');
assert.equal(clw.data.savingThrow, 'Will half (harmless); see text'); assert.equal(clw.data.spellResistance, 'yes (harmless); see text');
assert.ok(clw.data.description.startsWith('When laying your hand upon a living creature'));
assert.ok(!/Mass|mass cure|Mythic|2d8/.test(clw.data.description), 'related and mythic spells excluded');
ok('cure light wounds (embedded mass spell and mythic text excluded)');

const ba = spell('3pp-ball-of-air.html', U.ball);
assert.equal(ba.name, 'Ball of Air');
assert.equal(ba.data.school, 'conjuration'); assert.equal(ba.data.subschool, 'creation'); assert.deepEqual(ba.data.descriptors, ['air']);
assert.deepEqual(ba.spellLevels.map((x) => [x.cls, x.level]).sort(), [['cleric', 0], ['druid', 0], ['oracle', 0]]);
assert.ok(ba.data.areaTargetEffect.startsWith('Effect:')); assert.equal(ba.data.areaTargetEffect, 'Effect: 5-ft. radius ball of air');
assert.equal(ba.data.savingThrow, 'Reflex negates'); assert.equal(ba.data.spellResistance, 'no'); assert.equal(ba.data.duration, '1 round');
assert.ok(ba.data.description.startsWith('You send a small globe of air'));
ok('3pp ball of air');

// feats
const pa = feat('power-attack.html', U.pa);
assert.equal(pa.name, 'Power Attack'); assert.equal(pa.data.featType, 'Combat');
assert.ok(pa.data.prerequisites.includes('Str 13, base attack bonus +1'));
assert.ok(pa.data.benefit.includes('take a –1 penalty on all melee attack rolls'));
assert.ok(pa.data.benefit.includes('When your base attack bonus reaches +4'));
assert.ok(pa.data.benefit.includes('You must choose to use this feat before making an attack roll'));
assert.ok(pa.data.benefit.startsWith('You can choose to take'));
assert.equal(pa.summary, 'You can make exceptionally deadly melee attacks by sacrificing accuracy for strength.');
assert.ok(pa.data.description.startsWith(pa.summary));
assert.ok(pa.data.description.includes('Prerequisites: Str 13, base attack bonus +1'));
ok('power attack (three-paragraph benefit)');

const twf = feat('two-weapon-fighting.html', U.twf);
assert.equal(twf.name, 'Two-Weapon Fighting'); assert.equal(twf.data.prerequisites, 'Dex 15');
assert.ok(twf.data.description.includes('Normal: If you wield a second weapon'));
assert.ok(!/Editor|If you use Two-Weapon Fighting on your turn|Source/.test(twf.data.description), 'editor note excluded');
assert.ok(twf.data.description.includes('Normal penalties | –6 | –10'), 'table flattened to text');
ok('two-weapon fighting (normal kept, editor note dropped)');

const wf = feat('weapon-focus.html', U.wf);
assert.equal(wf.data.prerequisites, 'Proficiency with selected weapon, base attack bonus +1');
assert.ok(wf.data.description.includes('Special: You can gain this feat multiple times'));
assert.equal(wf.data.benefit, 'You gain a +1 bonus on all attack rolls you make using the selected weapon.');
ok('weapon focus');

const cs = feat('3pp-charging-shot.html', U.cs);
assert.equal(cs.name, 'Charging Shot'); assert.equal(cs.data.featType, 'Combat');
assert.equal(cs.data.prerequisites, 'Fast movement class feature');
assert.ok(cs.data.benefit.startsWith('You can charge towards an opponent'));
assert.equal(cs.summary, 'You can charge towards an opponent and make a ranged attack.');
assert.ok(!/shopify|buy/i.test(JSON.stringify(cs)));
ok('3pp charging shot (no flavor line -> first sentence of benefit)');

// magic items
const bag = gear('bag-of-holding.html', U.bag);
assert.equal(bag.name, 'Bag of Holding'); assert.equal(bag.data.slot, 'slotless'); assert.equal(bag.data.aura, 'moderate conjuration');
assert.equal(bag.data.cl, 9); assert.equal(bag.data.weight, 0); assert.equal(bag.data.cost, 'see below');
assert.ok(bag.data.description.startsWith('Slot —. Aura moderate conjuration. CL 9th'));
assert.ok(bag.data.description.includes('Bag Type | Bag Weight | Contents Limit'));
assert.ok(bag.data.description.includes('I | 15 lbs. | 250 lbs. | 30 cubic ft. | 2,500 gp'));
assert.ok(bag.data.description.includes('The bag of holding opens into a nondimensional space'), 'EFFECT section kept');
assert.ok(bag.data.description.includes('Construction\nFeats Craft Wondrous Item, secret chest; Cost 1,250 gp (type I)'));
assert.ok(!/Minor|Non-dimensional|Editor/i.test(bag.data.description), 'related item and editor note excluded');
assert.equal(bag.summary, 'This appears to be a common cloth sack about 2 feet by 4 feet in size.');
ok('bag of holding (extra EFFECT section, table, editor note dropped)');

const hb = gear('headband-of-vast-intelligence.html', U.headband);
assert.equal(hb.name, 'Headband of Vast Intelligence'); assert.equal(hb.data.slot, 'headband'); assert.equal(hb.data.aura, 'moderate transmutation');
assert.equal(hb.data.weight, 1); assert.equal(hb.data.cl, 8); assert.ok(hb.data.cost.startsWith('4,000 gp (+2), 16,000 gp (+4)'));
assert.ok(hb.summary.startsWith('This intricate gold headband'));
assert.ok(hb.data.description.includes('Cost 2,000 gp (+2), 8,000 gp (+4), 18,000 gp (+6)'));
assert.ok(!/retroactive|paizo\.com/i.test(hb.data.description), 'FAQ box excluded');
ok('headband of vast intelligence (FAQ box excluded)');

const rop = gear('ring-of-protection.html', U.rop);
assert.equal(rop.data.slot, 'ring'); assert.equal(rop.data.cl, 5); assert.equal(rop.data.aura, 'faint abjuration'); assert.equal(rop.data.weight, 0);
assert.ok(rop.data.cost.startsWith('2,000 gp (+1)')); assert.ok(rop.data.cost.includes('50,000 gp (+5)'));
assert.ok(rop.data.description.includes('Special creator must be of a level at least three times the bonus of the ring; Cost 1,000 gp (+1)'));
assert.ok(rop.summary.startsWith('This ring offers continual magical protection'));
ok('ring of protection');

const cr = gear('crypt-rod.html', U.crypt);
assert.equal(cr.data.slot, 'slotless'); assert.equal(cr.data.weight, 5); assert.equal(cr.data.cl, 9); assert.equal(cr.data.cost, '8,500 gp');
assert.equal(cr.data.aura, 'moderate divination');
assert.ok(cr.data.description.includes('Construction\n') && cr.data.description.includes('Cost'));
ok('crypt rod (field order differs)');

const sf = gear('staff-of-fire.html', U.staff);
assert.equal(sf.data.slot, 'slotless'); assert.equal(sf.data.weight, 5); assert.equal(sf.data.cl, 8); assert.equal(sf.data.cost, '18,950 gp');
assert.ok(sf.data.description.includes('• Fireball (2 charges)')); assert.ok(sf.data.description.includes('Craft Staff; Spells burning hands, fireball, wall of fire; Cost 9,475 gp.'));
assert.ok(sf.summary.startsWith('Crafted from bronzewood'));
ok('staff of fire (spell list, unlabeled Craft Staff)');

const sh = gear('3pp-ring-of-the-shepherd.html', U.shepherd);
assert.equal(sh.data.slot, 'ring'); assert.equal(sh.data.weight, 0); assert.equal(sh.data.cl, 1); assert.equal(sh.data.cost, '1,100 gp'); assert.equal(sh.name, 'Ring of the Shepherd');
ok('3pp ring of the shepherd');

const pu = gear('3pp-pubo-stone.html', U.pubo);
assert.equal(pu.name, 'Pubo Stone'); assert.equal(pu.data.cl, 5); assert.equal(pu.data.slot, 'slotless'); assert.equal(pu.data.weight, 1); assert.equal(pu.data.cost, '10,000 gp');
assert.ok(pu.data.description.includes('ML 5th'));
assert.ok(pu.data.description.includes('Delay Power'));
ok('3pp pubo stone (ML instead of CL)');

// small synthetic cases: fractions, unknown slot fallbacks, out-of-range level
const synth = (stat, url) => D.parseD20pfsrdPage(`<div id="article-content"><h1>Test Item</h1><p>${stat}</p><p class="divider">DESCRIPTION</p><p>It does a thing. Then more.</p></div>`, url);
const s1 = synth('<b>Aura</b> faint; <b>CL</b> 99th; <b>Slot</b> finger; <b>Price</b> 5 gp; <b>Weight</b> 1/2 lb.', U.rop);
assert.equal(s1.data.weight, 0.5); assert.equal(s1.data.slot, 'ring'); assert.equal(s1.data.cl, undefined); assert.equal(s1.summary, 'It does a thing.'); check(s1);
const s2 = synth('<b>Aura</b> faint; <b>CL</b> 3rd; <b>Slot</b> mystery; <b>Price</b> 5 gp; <b>Weight</b> see below', U.bag);
assert.equal(s2.data.slot, undefined); assert.equal(s2.data.weight, 0); check(s2);
assert.equal(synth('<b>Aura</b> faint; <b>CL</b> 3rd; <b>Slot</b> wrist; <b>Price</b> 5 gp; <b>Weight</b> 2 lbs.', U.bag).data.slot, 'wrists');
ok('slot aliases, fallbacks, weight and CL edge cases');

// URL routing
const K = D.d20pfsrdKindForUrl;
for (const host of ['www.d20pfsrd.com', 'd20pfsrd.com']) {
  for (const p of [
    'magic-items/wondrous-items/a-b/bag-of-holding/', 'magic-items/rings/ring-of-protection/', 'magic-items/rods/crypt-rod/', 'magic-items/staves/staff-of-fire/',
    'magic-items/3rd-party-magic-items/3rd-party-wondrous-items/some-pub/some-item/', 'magic-items/3rd-party-magic-items/3rd-party-rings/some-pub/some-ring/',
    'magic-items/3rd-party-magic-items/3rd-party-rods/some-pub/some-rod/', 'magic-items/3rd-party-magic-items/3rd-party-staves/some-pub/some-staff/',
  ]) assert.equal(K(`https://${host}/${p}`), 'gear', p);
  for (const p of [
    'magic-items/', 'magic-items/rings/', 'magic-items/rods/', 'magic-items/staves/', 'magic-items/wondrous-items/', 'magic-items/wondrous-items/a-b/',
    'magic-items/3rd-party-magic-items/', 'magic-items/3rd-party-magic-items/3rd-party-rings/', 'magic-items/3rd-party-magic-items/3rd-party-rings/4-winds-fantasy-gaming/',
    'magic-items/3rd-party-magic-items/3rd-party-wands/some-pub/some-wand/', 'magic-items/rings/a/b/', 'magic-items/wondrous-items/a-b/c/d/',
    'magic-items/potions-and-oils/cure-light-wounds/', 'magic-items/scrolls/scroll-of-x/', 'magic-items/wands/wand-of-magic-missile/', 'magic-items/artifacts/axe-of-the-dwarvish-lords/',
    'magic-items/cursed-items/cursed-sword/', 'magic-items/magic-weapons/specific-magic-weapons/flame-tongue/', 'magic-items/magic-armor/specific-magic-armor/mithral-shirt/',
  ]) assert.equal(K(`https://${host}/${p}`), null, p);
}
assert.equal(K(U.staff.slice(0, -1)), 'gear', 'no trailing slash');
ok('gear url routing (www / bare host, 3rd party, index pages null)');

for (const host of ['www.d20pfsrd.com', 'd20pfsrd.com']) {
  assert.equal(K(`https://${host}/magic/all-spells/f/fireball/`), 'spell');
  assert.equal(K(`https://${host}/magic/3rd-party-spells/some-publisher/some-spell/`), 'spell');
  assert.equal(K(`https://${host}/feats/combat-feats/power-attack-combat/`), 'feat');
  assert.equal(K(`https://${host}/feats/3rd-party-feats/some-publisher/some-feat/`), 'feat');
  assert.equal(K(`https://${host}/feats/3rd-party-feats/some-publisher/sub-category/some-feat/`), 'feat');
  assert.equal(D.isD20pfsrdUrl(`https://${host}/anything/`), true);
}
assert.equal(K('https://www.d20pfsrd.com/magic/all-spells/f/fireball'), 'spell', 'no trailing slash');
for (const bad of ['http://www.d20pfsrd.com/magic/all-spells/f/fireball/', 'https://aonprd.com/SpellDisplay.aspx?ItemName=Fireball', 'https://evil.example/magic/all-spells/f/fireball/', 'https://d20pfsrd.com.evil.example/magic/all-spells/f/fireball/', 'not a url']) {
  assert.equal(K(bad), null, bad); assert.equal(D.isD20pfsrdUrl(bad), false, bad);
}
ok('url routing (www / bare host; http and other hosts rejected)');

// rejections
const NO = new RegExp(D.D20PFSRD_UNSUPPORTED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
assert.equal(D.D20PFSRD_UNSUPPORTED, 'd20pfsrd import supports spells, feats, magic items (wondrous items, rings, rods, staves), weapons, armor and shields, and mundane gear. Magic weapons and armor, potions, scrolls, wands, artifacts and services are not supported yet.');
assert.equal(D.HINT, ' Open a single spell, feat, magic item, weapon, armor, shield or gear page (for goods-and-services gear, copy the link with the #item anchor).');
assert.ok(!/^\s*import\b/m.test(readFileSync(new URL('../lib/d20pfsrd/messages.ts', import.meta.url), 'utf8')), 'messages.ts must stay a leaf module (no imports)');
for (const u of [
  'https://www.d20pfsrd.com/bestiary/monster-listings/dragons/dragon-true/red-dragon/',
  'https://www.d20pfsrd.com/bestiary/monster-listings/humanoids/goblin/',
  'https://www.d20pfsrd.com/classes/core-classes/wizard/',
  'https://www.d20pfsrd.com/magic-items/potions-and-oils/cure-light-wounds/',
  'https://www.d20pfsrd.com/magic-items/scrolls/scroll-of-x/',
  'https://www.d20pfsrd.com/magic-items/wands/wand-of-magic-missile/',
  'https://www.d20pfsrd.com/magic-items/artifacts/axe-of-the-dwarvish-lords/',
  'https://www.d20pfsrd.com/magic-items/magic-weapons/specific-magic-weapons/flame-tongue/',
  'https://www.d20pfsrd.com/magic-items/magic-armor/specific-magic-armor/mithral-shirt/',
  'https://www.d20pfsrd.com/magic-items/rings/',
  'https://www.d20pfsrd.com/magic-items/wondrous-items/a-b/',
  'https://www.d20pfsrd.com/equipment---final/weapons/',
  'https://www.d20pfsrd.com/magic/all-spells/f/',
  'https://www.d20pfsrd.com/magic/all-spells/',
  'https://www.d20pfsrd.com/feats/combat-feats/',
  'https://www.d20pfsrd.com/feats/3rd-party-feats/alluria-publishing/',
  'https://www.d20pfsrd.com/',
]) {
  assert.equal(K(u), null, u);
  assert.throws(() => D.parseD20pfsrdPage(fx('fireball.html'), u), NO, u);
}
ok('unsupported pages and index pages rejected');

// content validation
assert.throws(() => D.parseD20pfsrdPage(fx('bag-of-holding.html'), U.pa), /Benefit/, 'feat url, non-feat html');
assert.throws(() => D.parseD20pfsrdPage(fx('goblin.html'), U.bag), /magic item/, 'gear url, monster html');
assert.throws(() => D.parseD20pfsrdPage(fx('goblin.html'), U.rop), NO, 'gear url, monster html (message)');
assert.throws(() => D.parseD20pfsrdPage(fx('fireball.html'), U.staff), /magic item/, 'gear url, spell html');
assert.throws(() => D.parseD20pfsrdPage(fx('power-attack.html'), U.crypt), /magic item/, 'gear url, feat html');
assert.throws(() => D.parseD20pfsrdPage(fx('staff-of-fire.html'), U.fireball), /School and Level/, 'spell url, gear html');
assert.throws(() => D.parseD20pfsrdPage(fx('ring-of-protection.html'), U.pa), /Benefit/, 'feat url, gear html');
assert.throws(() => D.parseD20pfsrdPage(fx('fireball.html'), U.pa), /Benefit/, 'feat url, spell html');
assert.throws(() => D.parseD20pfsrdPage(fx('power-attack.html'), U.fireball), /School and Level/, 'spell url, feat html');
assert.throws(() => D.parseD20pfsrdPage(fx('bag-of-holding.html'), U.fireball), /School and Level/, 'spell url, item html');
assert.throws(() => D.parseD20pfsrdPage('<html><body>nothing</body></html>', U.pa), NO);
ok('content validation (wrong html for the url)');

// hostile markup stays text-only
const evil = fx('power-attack.html').replace('Str</a> 13', 'Str</a> 13 <script>alert(1)</script><img src=x onerror=alert(1)>&lt;b&gt;');
const ev = D.parseD20pfsrdPage(evil, U.pa);
assert.ok(!/<(script|img)\b|alert\(1\)/i.test(ev.data.prerequisites), ev.data.prerequisites);
assert.ok(ev.data.prerequisites.startsWith('Str 13'));
ok('scripts and tags stripped');

// magic item module split
const MI = await import('../lib/d20pfsrd/magic-items.ts');
assert.equal(typeof MI.parseD20pfsrdMagicItem, 'function');
assert.equal(typeof MI.magicItemCategory, 'function');
assert.equal(MI.magicItemCategory(['magic-items', 'rings', 'ring-of-protection']), 'ring');
assert.equal(MI.magicItemCategory(['magic-items', 'magic-weapons', 'specific-magic-weapons', 'flame-tongue']), null);
assert.equal(MI.magicItemCategory(['magic-items', 'magic-armor', 'specific-magic-armor', 'mithral-shirt']), null);
ok('magic-items module exports; weapons/armor paths rejected');

// Every d20pfsrd example URL shown as an input placeholder is accepted by the router.
const hallSrc = readFileSync(new URL('../components/library/hall-client.tsx', import.meta.url), 'utf8');
const placeholders = hallSrc.match(/https:\/\/www\.d20pfsrd\.com\/[^'"\s]+/g) ?? [];
assert.ok(placeholders.length >= 5, 'placeholder URLs found');
for (const u of placeholders) assert.ok(D.d20pfsrdKindForUrl(u), `placeholder accepted: ${u}`);
ok('hall-client placeholder URLs accepted by d20pfsrdKindForUrl');

const AON = await import('../lib/aon-catalog-parser.ts');
const aonPlaceholders = hallSrc.match(/https:\/\/www\.aonprd\.com\/[^'"\s]+/g) ?? [];
assert.ok(aonPlaceholders.length >= 1, 'AoN placeholder URL found');
for (const u of aonPlaceholders) assert.ok(AON.catalogKindForUrl(u), `AoN placeholder accepted: ${u}`);
ok('hall-client AoN placeholder URLs accepted by catalogKindForUrl');

console.log(`\n${count} d20pfsrd checks passed`);

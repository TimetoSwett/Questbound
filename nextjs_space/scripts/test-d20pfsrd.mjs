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
  else { L.featDataSchema.parse(d.data); assert.equal(d.spellLevels, undefined); }
  for (const s of [d.name, d.summary, ...Object.values(d.data).flat()]) {
    assert.ok(!/<\/?[a-z][^>]*>/i.test(s), `HTML left in: ${s.slice(0, 80)}`);
    assert.ok(!/Section 15|Copyright/i.test(s), 'copyright text left');
    assert.ok(!/&(#\d+|[a-z]+);/i.test(s), 'undecoded entity');
  }
  assert.ok(!d.summary.includes('\n'));
}
const spell = (f, u) => { const d = D.parseD20pfsrdPage(fx(f), u); check(d); assert.equal(d.kind, 'spell'); return d; };
const feat = (f, u) => { const d = D.parseD20pfsrdPage(fx(f), u); check(d); assert.equal(d.kind, 'feat'); return d; };
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

// URL routing
const K = D.d20pfsrdKindForUrl;
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
const NO = /supports spells and feats only/;
assert.equal(K(U.bag), null);
assert.throws(() => D.parseD20pfsrdPage(fx('bag-of-holding.html'), U.bag), NO);
for (const u of [
  'https://www.d20pfsrd.com/bestiary/monster-listings/dragons/dragon-true/red-dragon/',
  'https://www.d20pfsrd.com/classes/core-classes/wizard/',
  'https://www.d20pfsrd.com/magic-items/rings/ring-of-protection/',
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

console.log(`\n${count} d20pfsrd checks passed`);

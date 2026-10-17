#!/usr/bin/env -S npx tsx
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const W = await import('../lib/d20pfsrd/weapons.ts');
const D = await import('../lib/d20pfsrd-parser.ts');
const L = await import('../lib/library.ts');
const fx = (f) => readFileSync(new URL(`./fixtures/d20pfsrd/${f}`, import.meta.url), 'utf8');
const core = 'https://www.d20pfsrd.com/equipment/weapons/weapon-descriptions/';
const third = 'https://www.d20pfsrd.com/equipment/3rd-party-equipment/3rd-party-weapons/';
const ok = (m) => console.log(`ok   ${m}`);
function check(d) {
  const r = L.parseCreateInput(d);
  assert.equal(r.ok, true, r.ok ? '' : JSON.stringify(r.error));
  assert.equal(d.kind, 'weapon');
  assert.equal(r.value.kind, 'weapon'); assert.equal(r.value.system, 'pf1e');
  assert.equal(r.value.sourceUrl, d.sourceUrl); assert.equal(r.value.name, d.name);
  L.weaponDataSchema.parse(d.data);
  assert.ok(d.summary); assert.ok(!/[\r\n]/.test(d.summary));
  for (const s of [d.name, d.summary, ...Object.values(d.data)].filter((v) => typeof v === 'string')) {
    assert.ok(!/<\/?[a-z][^>]*>/i.test(s), `HTML left: ${s.slice(0, 80)}`);
    assert.ok(!/Section 15|Copyright/i.test(s), 'copyright text left');
    assert.ok(!/&(#(?:\d+|x[\da-f]+)|[a-z]+);/i.test(s), 'undecoded entity');
  }
}
function parse(file, url, expected) {
  assert.equal(W.isD20pfsrdWeaponUrl(url), true);
  assert.equal(D.d20pfsrdKindForUrl(url), 'weapon');
  const d = D.parseD20pfsrdPage(fx(file), url); check(d);
  for (const [key, value] of Object.entries(expected)) assert.equal(d.data[key], value, `${file}: ${key}`);
  return d;
}
const longsword = parse('weapon-longsword.html', core + 'longsword/', {
  category: 'melee', hands: 'one', ability: 'str', damage: '1d8', crit: '19-20/x2', range: 0, type: 'slashing', cost: '15 gp', weight: 4,
});
for (const s of ['about 3', 'Hwandudaedo', 'Proficiency: martial', 'Weapon group: heavy blades.']) assert.ok(longsword.data.description.includes(s));
ok('longsword');
parse('weapon-greatsword.html', core + 'greatsword/', { hands: 'two', damage: '2d6' }); ok('greatsword');
const longbow = parse('weapon-longbow.html', core + 'longbow/', {
  category: 'ranged', ability: 'dex', damage: '1d8', crit: 'x3', range: 100, cost: '75 gp', weight: 3,
});
assert.equal(Object.hasOwn(longbow.data, 'hands'), false); ok('longbow');
const crossbow = parse('weapon-crossbow-light.html', core + 'crossbow-light/', { category: 'ranged', ability: 'dex', range: 80 });
assert.ok(crossbow.data.description.includes('Load:')); ok('light crossbow');
parse('weapon-dagger.html', core + 'dagger/', { category: 'melee', hands: 'one', damage: '1d4', range: 10, type: 'piercing or slashing', cost: '2 gp', weight: 1 }); ok('dagger');
const mac = parse('3pp-weapon-macuahuitl.html', third + 'little-red-goblin-games/macuahuitl/', {
  category: 'melee', hands: 'one', damage: '1d8', crit: '19-20/x2', range: 0, type: 'slashing', cost: '5 gp', weight: 2,
});
assert.ok(mac.data.description.includes('fragile')); assert.ok(mac.data.description.includes('Special: fragile.')); ok('macuahuitl');
const unsupported = (error) => error instanceof Error && error.message.startsWith(D.D20PFSRD_UNSUPPORTED);
assert.equal(D.d20pfsrdKindForUrl(third + 'samurai-sheepdog/vardatch/'), 'weapon');
assert.throws(() => D.parseD20pfsrdPage(fx('3pp-weapon-vardatch-nostats.html'), third + 'samurai-sheepdog/vardatch/'), unsupported);
assert.equal(W.isD20pfsrdWeaponUrl(core), false);
assert.equal(D.d20pfsrdKindForUrl(core), null);
const magicWeapon = 'https://www.d20pfsrd.com/magic-items/magic-weapons/specific-magic-weapons/flame-tongue/';
// Specific magic weapons import as gear (magic-items.ts), not through the mundane weapon table parser.
assert.equal(D.d20pfsrdKindForUrl(magicWeapon), 'gear');
assert.equal(W.isD20pfsrdWeaponUrl(magicWeapon), false);
assert.throws(() => D.parseD20pfsrdPage(fx('weapon-descriptions-index.html'), core), unsupported);
for (const url of [
  'https://www.d20pfsrd.com/magic/all-spells/f/fireball/',
  'https://www.d20pfsrd.com/feats/combat-feats/power-attack-combat/',
  core.replace('https:', 'http:') + 'longsword/',
  core.replace('www.d20pfsrd.com', 'evil.example') + 'longsword/',
  core.replace('www.d20pfsrd.com', 'd20pfsrd.com.evil.example') + 'longsword/',
  third, third + 'publisher/', core + 'longsword/extra/', 'not a url',
]) {
  assert.equal(W.isD20pfsrdWeaponUrl(url), false, url);
  assert.throws(() => D.parseD20pfsrdPage(fx('weapon-longsword.html'), url), unsupported);
}
assert.equal(W.isD20pfsrdWeaponUrl(core.toUpperCase() + 'LONGSWORD/'), true);
ok('URL routing and missing-stat/index rejections');

// Edge cases use local fixture mutations to exercise normalization and header mapping.
const swordHtml = fx('weapon-longsword.html');
const edge = D.parseD20pfsrdPage(swordHtml.replace('4 lbs.', '1/2 lb.').replace('19-20/x2', '19-20/×2').replace('<b>Cost</b> 15 gp', '<b>Cost: </b> —'), core + 'longsword/');
check(edge); assert.equal(edge.data.weight, 0.5); assert.equal(edge.data.cost, ''); assert.equal(edge.data.crit, '19-20/x2');
const dash = D.parseD20pfsrdPage(swordHtml.replace('1d6 (small), 1d8 (medium)', '—').replace('4 lbs.', '—'), core + 'longsword/');
check(dash); assert.equal(dash.data.damage, ''); assert.equal(dash.data.weight, 0);
const mixed = D.parseD20pfsrdPage(fx('3pp-weapon-macuahuitl.html').replace('>S</td>', '>B or P</td>'), third + 'publisher/weapon/');
check(mixed); assert.equal(mixed.data.type, 'bludgeoning or piercing');
const faq = D.parseD20pfsrdPage(swordHtml.replace('<div class="section15">', '<div class="faq"><p>FAQ SHOULD BE EXCLUDED</p></div><div class="section15">'), core + 'longsword/');
check(faq); assert.ok(!faq.data.description.includes('FAQ SHOULD'));
for (const [name, range, category] of [['Composite Longbow', '100 ft. (projectile)', 'composite'], ['Thrown Weapon', '20 ft. (thrown)', 'thrown']]) {
  const d = D.parseD20pfsrdPage(fx('weapon-longbow.html').replace('<h1>Longbow</h1>', `<h1>${name}</h1>`).replace('100 ft. (projectile)', range), core + 'weapon/');
  check(d); assert.equal(d.data.category, category); assert.equal(Object.hasOwn(d.data, 'hands'), false);
}
ok('fractions, dashes, multiplication, type letters, FAQ, composite and thrown');
console.log('D20PFSRD WEAPONS: PASS');

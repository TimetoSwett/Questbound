#!/usr/bin/env -S npx tsx
// d20pfsrd.com mundane armor + shield parser tests (offline, saved fixtures under scripts/fixtures/d20pfsrd).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const D = await import('../lib/d20pfsrd-parser.ts');
const A = await import('../lib/d20pfsrd/armor.ts');
const L = await import('../lib/library.ts');
const fx = (f) => readFileSync(new URL(`./fixtures/d20pfsrd/${f}`, import.meta.url), 'utf8');
const IDX = { core: 'https://www.d20pfsrd.com/equipment/armor/', p3: 'https://www.d20pfsrd.com/equipment/3rd-party-equipment/3rd-party-armor-shields/' };
const U = {
  leather: 'https://www.d20pfsrd.com/equipment/armor/leather/',
  cs: 'https://www.d20pfsrd.com/equipment/armor/chain-shirt/',
  fp: 'https://www.d20pfsrd.com/equipment/armor/full-plate/',
  steel: 'https://www.d20pfsrd.com/equipment/armor/shield-heavy-wooden-or-steel/',
  wooden: 'https://www.d20pfsrd.com/equipment/armor/shield-heavy-wooden-or-steel/#wooden',
  tower: 'https://www.d20pfsrd.com/equipment/armor/shield-tower/',
  ecranche: 'https://www.d20pfsrd.com/equipment/armor/ecranche/',
  pa: 'https://www.d20pfsrd.com/feats/combat-feats/power-attack-combat/',
  rop: 'https://www.d20pfsrd.com/magic-items/rings/ring-of-protection/',
};
let count = 0;

// Every parsed draft must pass the real create validation, with clean text.
function check(d) {
  const r = L.parseCreateInput(d);
  assert.equal(r.ok, true, r.ok ? '' : JSON.stringify(r.error));
  assert.equal(r.value.kind, 'armor'); assert.equal(r.value.system, 'pf1e');
  assert.equal(r.value.sourceUrl, d.sourceUrl); assert.equal(r.value.name, d.name); assert.ok(r.value.summary);
  L.armorDataSchema.parse(d.data); assert.equal(d.spellLevels, undefined);
  for (const s of [d.name, d.summary, ...Object.values(d.data).flat()].filter((x) => typeof x === 'string')) {
    assert.ok(!/<\/?[a-z][^>]*>/i.test(s), `HTML left in: ${s.slice(0, 80)}`);
    assert.ok(!/Section 15|Copyright/i.test(s), 'copyright text left');
    assert.ok(!/&(#\d+|[a-z]+);/i.test(s), 'undecoded entity');
  }
  assert.ok(!d.summary.includes('\n'));
}
const ok = (m) => { count++; console.log(`ok   ${m}`); };

// fake index fetcher: records calls, serves the fixtures
const fetches = [];
const fakeFetch = async (u) => { fetches.push(u); return { html: u === IDX.core ? fx('armor-index.html') : fx('armor-3pp-index.html') }; };
const armor = (f, u, extra = []) => { fetches.length = 0; const d = D.parseD20pfsrdPage(fx(f), u, extra); check(d); return d; };
const pages = async (f, u) => A.d20pfsrdArmorIndexPages(u, fx(f), fakeFetch);

// body armor pages with their own stat block
const le = armor('armor-leather.html', U.leather);
assert.equal(le.name, 'Leather'); assert.equal(le.data.slot, 'armor');
assert.equal(le.data.acBonus, 2); assert.equal(le.data.maxDex, 6); assert.equal(le.data.checkPenalty, 0); assert.equal(le.data.spellFailure, 10);
assert.equal(le.data.cost, '10 gp'); assert.equal(le.data.weight, 15);
assert.ok(le.data.description.includes('Light Armor') && le.data.description.includes('30 ft./20 ft.'));
ok('leather (stat block page)');

const cs = armor('armor-chain-shirt.html', U.cs);
assert.equal(cs.name, 'Chain Shirt'); assert.equal(cs.data.slot, 'armor');
assert.equal(cs.data.acBonus, 4); assert.equal(cs.data.maxDex, 4); assert.equal(cs.data.checkPenalty, -2); assert.equal(cs.data.spellFailure, 20);
assert.equal(cs.data.cost, '100 gp'); assert.equal(cs.data.weight, 25);
ok('chain shirt');

const fp = armor('armor-full-plate.html', U.fp);
assert.equal(fp.name, 'Full Plate'); assert.equal(fp.data.slot, 'armor');
assert.equal(fp.data.acBonus, 9); assert.equal(fp.data.maxDex, 1); assert.equal(fp.data.checkPenalty, -6); assert.equal(fp.data.spellFailure, 35);
assert.equal(fp.data.cost, '1,500 gp'); assert.equal(fp.data.weight, 50);
assert.ok(fp.data.description.includes('Heavy Armor') && fp.data.description.includes('platemail'));
ok('full plate');

// shields: stats come from the index row
let ip = await pages('armor-shield-heavy-wooden-or-steel.html', U.steel);
assert.deepEqual(fetches, [IDX.core], 'one core index fetch');
const st = armor('armor-shield-heavy-wooden-or-steel.html', U.steel, ip);
assert.equal(st.name, 'Shield, Heavy Steel'); assert.equal(st.data.slot, 'shield');
assert.equal(st.data.acBonus, 2); assert.equal(st.data.maxDex, null); assert.equal(st.data.checkPenalty, -2); assert.equal(st.data.spellFailure, 15);
assert.equal(st.data.cost, '20 gp'); assert.equal(st.data.weight, 15);
ok('heavy steel shield (row variant chosen over wooden)');

ip = await pages('armor-shield-heavy-wooden-or-steel.html', U.wooden);
const wd = armor('armor-shield-heavy-wooden-or-steel.html', U.wooden, ip);
assert.equal(wd.name, 'Shield, Heavy Wooden'); assert.equal(wd.data.cost, '7 gp'); assert.equal(wd.data.weight, 10); assert.equal(wd.data.checkPenalty, -2);
ok('heavy wooden shield (hash variant)');

ip = await pages('armor-shield-tower.html', U.tower);
assert.deepEqual(fetches, [IDX.core], 'tower shield: exactly one index fetch');
const tw = armor('armor-shield-tower.html', U.tower, ip);
assert.equal(tw.name, 'Shield, Tower'); assert.equal(tw.data.slot, 'shield');
assert.equal(tw.data.acBonus, 4); assert.equal(tw.data.maxDex, 2); assert.equal(tw.data.checkPenalty, -10); assert.equal(tw.data.spellFailure, 50);
assert.equal(tw.data.cost, '30 gp'); assert.equal(tw.data.weight, 45);
assert.ok(tw.data.description.includes('total cover'));
ok('tower shield (sup footnote ignored, one fetch)');

// third-party shield: only the 3pp index links to it
ip = await pages('armor-3pp-ecranche.html', U.ecranche);
assert.deepEqual(fetches, [IDX.core, IDX.p3], 'core then 3pp index');
const ec = armor('armor-3pp-ecranche.html', U.ecranche, ip);
assert.equal(ec.name, 'Ecranche'); assert.equal(ec.data.slot, 'shield');
assert.equal(ec.data.acBonus, 1); assert.equal(ec.data.maxDex, null); assert.equal(ec.data.checkPenalty, -2); assert.equal(ec.data.spellFailure, 15);
assert.equal(ec.data.cost, '50 gp'); assert.equal(ec.data.weight, 6);
assert.ok(ec.data.description.includes('RGG:GGA') && ec.data.description.includes('buckler'));
ok('3pp ecranche (two fetches, source in description)');

// stat block pages never fetch
fetches.length = 0;
ip = await pages('armor-full-plate.html', U.fp);
assert.deepEqual(fetches, []); assert.deepEqual(ip, []);
ok('stat block page fetches nothing');

// no stats anywhere
assert.throws(() => armor('armor-shield-tower.html', 'https://www.d20pfsrd.com/equipment/armor/not-real/', [fx('armor-index.html'), fx('armor-3pp-index.html')]), (e) => e.message.startsWith(D.D20PFSRD_UNSUPPORTED));
ok('no matching row throws unsupported');

// Extras rows (armor spikes, shield boss, locked gauntlet) are add-ons, not armor: rejected even though the core index links them.
assert.throws(() => armor('armor-shield-tower.html', 'https://www.d20pfsrd.com/equipment/armor/armor-spikes/', [fx('armor-index.html'), fx('armor-3pp-index.html')]), /no armor or shield stats/);
ok('extras rows are not imported as armor');

for (const d of [le, cs, fp, st, wd, tw, ec]) assert.ok(!/\.\./.test(d.data.description.split('\n')[0]), `stray double period: ${d.data.description.split('\n')[0]}`);
ok('lead lines are clean');

// URL routing
for (const host of ['www.d20pfsrd.com', 'd20pfsrd.com']) {
  for (const p of [`https://${host}/equipment/armor/leather/`, `https://${host}/equipment/armor/leather`, `https://${host}/equipment/armor/ecranche/`]) {
    assert.equal(A.isD20pfsrdArmorUrl(p), true, p); assert.equal(D.d20pfsrdKindForUrl(p), 'armor', p);
  }
}
for (const bad of [
  'https://www.d20pfsrd.com/equipment/armor/', 'https://www.d20pfsrd.com/equipment/armor/armor-modifications/',
  'http://www.d20pfsrd.com/equipment/armor/leather/', 'https://aonprd.com/equipment/armor/leather/',
  'https://www.d20pfsrd.com/equipment/weapons/longsword/', 'https://www.d20pfsrd.com/equipment/armor/leather/weapons/klar/',
]) assert.equal(A.isD20pfsrdArmorUrl(bad), false, bad);
for (const u of [
  'https://www.d20pfsrd.com/equipment/goods-and-services/', 'https://www.d20pfsrd.com/equipment/armor/',
  'https://www.d20pfsrd.com/equipment/armor/armor-modifications/',
  'https://www.d20pfsrd.com/equipment/3rd-party-equipment/3rd-party-armor-shields/',
  'https://www.d20pfsrd.com/magic-items/magic-armor/specific-magic-armor/mithral-shirt/',
]) {
  assert.equal(D.d20pfsrdKindForUrl(u), null, u);
  assert.throws(() => D.parseD20pfsrdPage(fx('armor-leather.html'), u), (e) => e.message.startsWith(D.D20PFSRD_UNSUPPORTED), u);
}
ok('armor url routing (index, modifications, magic armor rejected)');

// routing for others unchanged
assert.equal(D.d20pfsrdKindForUrl(U.pa), 'feat'); assert.equal(D.d20pfsrdKindForUrl(U.rop), 'gear');
fetches.length = 0;
assert.deepEqual(await A.d20pfsrdArmorIndexPages(U.pa, fx('power-attack.html'), fakeFetch), []);
assert.deepEqual(fetches, [], 'no fetch for non-armor url');
ok('other kinds still route the same');

console.log(`\n${count} d20pfsrd armor checks passed`);
console.log('D20PFSRD ARMOR TESTS: PASS');

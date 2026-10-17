#!/usr/bin/env -S npx tsx
// d20pfsrd.com mundane gear parser tests (offline, saved fixtures under scripts/fixtures/d20pfsrd).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Dynamic import so named exports resolve under tsx on Node 26 (static named imports of .ts from .mjs come through as CJS there).
const D = await import('../lib/d20pfsrd-parser.ts');
const G = await import('../lib/d20pfsrd/gear.ts');
const L = await import('../lib/library.ts');
const fx = (f) => readFileSync(new URL(`./fixtures/d20pfsrd/${f}`, import.meta.url), 'utf8');
const U = {
  bedroll: 'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/#bedroll',
  tent: 'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/#tent',
  thieves: 'https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#tools_thieves8217',
  battery: 'https://www.d20pfsrd.com/equipment/goods-and-services/technological-gear/#battery',
  multi: 'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/',
  index: 'https://www.d20pfsrd.com/equipment/goods-and-services/',
};
let count = 0;

// Every parsed draft must pass the real create validation, with clean text and no magic fields.
function check(d) {
  const r = L.parseCreateInput(d);
  assert.equal(r.ok, true, r.ok ? '' : JSON.stringify(r.error));
  assert.equal(r.value.kind, 'gear'); assert.equal(r.value.system, 'pf1e');
  assert.equal(r.value.sourceUrl, d.sourceUrl); assert.equal(r.value.name, d.name); assert.ok(r.value.summary);
  L.gearDataSchema.parse(d.data);
  assert.equal(d.data.aura, undefined, 'mundane gear has no aura');
  assert.equal(d.data.cl, undefined, 'mundane gear has no CL');
  assert.ok(['slotless', undefined].includes(d.data.slot));
  for (const s of [d.name, d.summary, d.data.cost ?? '', d.data.description]) {
    assert.ok(!/<\/?[a-z][^>]*>/i.test(s), `HTML left in: ${s.slice(0, 80)}`);
    assert.ok(!/Section 15|Copyright/i.test(s), 'copyright text left');
    assert.ok(!/&(#\d+|[a-z]+);/i.test(s), 'undecoded entity');
  }
  assert.ok(!d.summary.includes('\n'));
}
const gear = (f, u) => { const d = G.parseD20pfsrdGearPage(fx(f), u); check(d); assert.equal(d.kind, 'gear'); return d; };
const ok = (m) => { count++; console.log(`ok   ${m}`); };

// simple item with Price/Weight paragraph
const br = gear('adventuring-gear.html', U.bedroll);
assert.equal(br.name, 'Bedroll');
assert.equal(br.data.cost, '1 sp');
assert.equal(br.data.weight, 5);
assert.equal(br.data.slot, 'slotless');
assert.ok(br.data.description.includes('two woolen sheets sewn together'));
assert.ok(!/Price|Weight/.test(br.data.description), 'price line not in description');
assert.ok(br.summary.length > 0);
ok('bedroll (simple price/weight)');

// another item from the same page
const tent = gear('adventuring-gear.html', U.tent);
assert.equal(tent.name, 'Tent');
// The trimmed fixture's Tent section has no price line; the following
// Hunting and Fishing table must not be misattributed to it.
assert.equal(tent.data.cost, '');
assert.ok(tent.data.weight >= 0);
assert.ok(tent.data.description.length > 20);
ok('tent (second item, same page)');

// variant table: first row wins
const th = gear('tools-kits.html', U.thieves);
assert.equal(th.name, 'Tools, Thieves’');
assert.equal(th.data.cost, '30 gp', 'first table row (Common)');
assert.equal(th.data.weight, 1);
assert.ok(th.data.description.includes('Disable Device'));
ok("thieves' tools (variant table, first row)");

// technological gear
const bat = gear('tech-gear.html', U.battery);
assert.equal(bat.name, 'Battery');
assert.ok(bat.data.cost.length > 0);
assert.ok(bat.data.description.length > 20);
ok('battery (technological gear)');

// URL routing
const K = D.d20pfsrdKindForUrl;
for (const host of ['www.d20pfsrd.com', 'd20pfsrd.com']) {
  assert.equal(K(`https://${host}/equipment/goods-and-services/hunting-camping-survival-gear/#bedroll`), 'gear');
  assert.equal(K(`https://${host}/equipment/goods-and-services/tools-kits/`), 'gear');
  assert.equal(K(`https://${host}/equipment/goods-and-services/animals-animal-gear/`), 'gear');
  assert.equal(D.isD20pfsrdUrl(`https://${host}/equipment/goods-and-services/tools-kits/`), true);
}
assert.equal(K('https://www.d20pfsrd.com/equipment/goods-and-services/'), null, 'index page rejected');
assert.equal(K('https://www.d20pfsrd.com/equipment/goods-and-services'), null, 'index page rejected (no slash)');
assert.equal(K('https://www.d20pfsrd.com/equipment/weapons/'), null, 'weapons not gear');
assert.equal(K('https://www.d20pfsrd.com/equipment/armor/'), null, 'armor not gear');
assert.equal(K('https://www.d20pfsrd.com/magic-items/wondrous-items/a-b/bag-of-holding/'), 'gear', 'wondrous items route to gear (magic-item parser)');
ok('url routing (gear pages; weapons/armor/index rejected; wondrous -> magic items)');

// rejections
const NOFRAG = /lists .* items/;
assert.throws(() => G.parseD20pfsrdGearPage(fx('adventuring-gear.html'), U.multi), NOFRAG, 'multi-item page without fragment');
assert.throws(() => G.parseD20pfsrdGearPage(fx('adventuring-gear.html'), U.bedroll.replace('#bedroll', '#no-such-item')), /No item/, 'bad fragment');
assert.throws(() => D.parseD20pfsrdPage(fx('adventuring-gear.html'), U.multi), NOFRAG, 'routed parser rejects too');
ok('rejections (multi-item without fragment, bad fragment)');

console.log(`\n${count} d20pfsrd gear checks passed`);

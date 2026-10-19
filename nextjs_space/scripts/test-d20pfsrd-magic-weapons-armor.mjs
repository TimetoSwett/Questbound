#!/usr/bin/env -S npx tsx
// d20pfsrd.com magic weapons, magic armor, and potions tests (offline, saved fixtures).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const D = await import('../lib/d20pfsrd-parser.ts');
const L = await import('../lib/library.ts');
const fx = (f) => readFileSync(new URL(`./fixtures/d20pfsrd/${f}`, import.meta.url), 'utf8');
let count = 0;
const ok = (m) => { count++; console.log(`ok   ${m}`); };

function check(d, url) {
  const r = L.parseCreateInput(d);
  assert.equal(r.ok, true, r.ok ? '' : JSON.stringify(r.error));
  assert.equal(r.value.kind, 'gear');
  L.gearDataSchema.parse(d.data);
  assert.ok(d.data.aura, 'has aura');
  assert.ok(d.data.cl !== undefined, 'has CL');
  assert.ok(d.data.cost, 'has cost');
  for (const s of [d.name, d.data.description]) {
    assert.ok(!/<\/?[a-z][^>]*>/i.test(s), `HTML left in: ${s.slice(0, 60)}`);
  }
}

// ---- URL routing ----
const K = D.d20pfsrdKindForUrl;
assert.equal(K('https://www.d20pfsrd.com/magic-items/magic-weapons/specific-magic-weapons/arachnid-s-fang/'), 'gear');
assert.equal(K('https://www.d20pfsrd.com/magic-items/magic-armor/specific-magic-armor/advocate-s-armor/'), 'gear');
assert.equal(K('https://www.d20pfsrd.com/magic-items/potions/other-potions/calming-oils/'), 'gear');
// Index pages rejected
assert.equal(K('https://www.d20pfsrd.com/magic-items/magic-weapons/'), null);
assert.equal(K('https://www.d20pfsrd.com/magic-items/magic-armor/'), null);
assert.equal(K('https://www.d20pfsrd.com/magic-items/potions/'), null);
// Wrong depth rejected
assert.equal(K('https://www.d20pfsrd.com/magic-items/magic-weapons/specific-magic-weapons/'), null);
ok('url routing');

// ---- Magic weapon ----
{
  const url = 'https://www.d20pfsrd.com/magic-items/magic-weapons/specific-magic-weapons/arachnid-s-fang/';
  const d = D.parseD20pfsrdPage(fx('magic-weapons/magic-weapon-arachnid-fang.html'), url);
  check(d, url);
  assert.match(d.name, /arachnid/i);
  assert.equal(d.data.cost, '18,302 gp');
  assert.equal(d.data.slot, 'slotless');
  assert.equal(d.data.cl, 9);
  ok('magic weapon: arachnid fang');
}

// ---- Magic armor ----
{
  const url = 'https://www.d20pfsrd.com/magic-items/magic-armor/specific-magic-armor/advocate-s-armor/';
  const d = D.parseD20pfsrdPage(fx('magic-armor/magic-armor-advocate.html'), url);
  check(d, url);
  assert.equal(d.data.cost, '33,160 gp');
  assert.equal(d.data.slot, 'armor');
  assert.equal(d.data.cl, 11);
  ok('magic armor: advocate armor');
}

// ---- Potion ----
{
  const url = 'https://www.d20pfsrd.com/magic-items/potions/other-potions/calming-oils/';
  const d = D.parseD20pfsrdPage(fx('potions/potion-calming-oils.html'), url);
  check(d, url);
  assert.equal(d.data.cost, '1,000 gp');
  assert.equal(d.data.slot, 'slotless');
  assert.equal(d.data.cl, 5);
  ok('potion: calming oils');
}

console.log(`\n${count} magic weapon/armor/potion checks passed`);

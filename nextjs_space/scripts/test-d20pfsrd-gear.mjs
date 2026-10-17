#!/usr/bin/env -S npx tsx
// d20pfsrd.com mundane gear parser tests (offline, saved fixtures under scripts/fixtures/d20pfsrd).
// Fixtures are FULL saved pages. Tests cover real items, synthetic Widget probes for edge cases,
// URL routing, and rejections.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Dynamic import so named exports resolve under tsx on Node 26 (static named imports of .ts from .mjs come through as CJS there).
const D = await import('../lib/d20pfsrd-parser.ts');
const G = await import('../lib/d20pfsrd/gear.ts');
const L = await import('../lib/library.ts');
const fx = (f) => readFileSync(new URL(`./fixtures/d20pfsrd/${f}`, import.meta.url), 'utf8');
const U = {
  bedroll: 'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/#bedroll',
  tent: 'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/#TOC-Tent',
  bat: 'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/#bat',
  chain: 'https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#chain',
  thieves: 'https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#TOC-Tools-Thieves-',
  battery: 'https://www.d20pfsrd.com/equipment/goods-and-services/technological-gear/#battery',
  multi: 'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/',
  hirelings: 'https://www.d20pfsrd.com/equipment/goods-and-services/hirelings-servants-services/',
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

// ---- Real page assertions (Clok's acceptance) ----
const chain = gear('tools-kits.html', U.chain);
assert.equal(chain.data.cost, '30 gp'); assert.equal(chain.data.weight, 2);
ok('Chain (10 ft.) = 30 gp, 2 lb');

const tent = gear('hunting-camping-survival-gear.html', U.tent);
assert.equal(tent.name, 'Tent, small'); assert.equal(tent.data.cost, '10 gp'); assert.equal(tent.data.weight, 20);
ok('Tent, small = 10 gp, 20 lb (#TOC-Tent anchor)');

const bat = gear('hunting-camping-survival-gear.html', U.bat);
assert.equal(bat.data.cost, '5 gp'); assert.equal(bat.data.weight, 1);
ok('Bat = 5 gp, 1 lb');

const battery = gear('technological-gear.html', U.battery);
assert.equal(battery.data.weight, 1, 'Battery = 1 lb (Price; Slot; Weight line)');
assert.ok(battery.data.cost.length > 0);
ok('Battery weight from Price/Slot/Weight line');

const br = gear('hunting-camping-survival-gear.html', U.bedroll);
assert.equal(br.name, 'Bedroll'); assert.equal(br.data.cost, '1 sp'); assert.equal(br.data.weight, 5);
ok('Bedroll = 1 sp, 5 lb');

const th = gear('tools-kits.html', U.thieves);
assert.ok(th.data.cost.length > 0, 'thieves tools has a cost');
assert.ok(!/Price|Weight/.test(th.data.description) || th.data.description.includes('Disable Device'));
ok("Thieves' Tools (TOC anchor with trailing dash)");

// ---- Synthetic Widget probes ----
const widgetPage = (body) => `<html><body><div id="article-content">${body}</div></body></html>`;
const widget = (body, frag) => {
  const url = `https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#${frag}`;
  return G.parseD20pfsrdGearPage(widgetPage(body), url);
};
const sec = (id, name, inner) => `<h4><span id="${id}">${name}</span></h4>${inner}`;

// Already correct, keep passing
let w = widget(
  `<table><tr><th>Item</th><th>Cost</th><th>Weight</th></tr><tr><td><a href="#widget">Widget</a></td><td>5 gp</td><td>2 lb.</td></tr></table>` +
  sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp'); assert.equal(w.data.weight, 2);
ok('Widget: Item/Cost/Weight header');

w = widget(
  `<table><tr><th>Item</th><th>Price<sup>1</sup></th><th>Weight</th></tr><tr><td><a href="#widget">Widget</a></td><td>5 gp</td><td>2 lb.</td></tr></table>` +
  sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp');
ok('Widget: Price header with footnote markers');

w = widget(
  `<table><tr><th>Item</th><th>Type</th><th>Price</th><th>Weight</th><th>Source</th></tr><tr><td><a href="#widget">Widget</a></td><td>Tool</td><td>5 gp</td><td>2 lb.</td><td>PZO</td></tr></table>` +
  sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp'); assert.equal(w.data.weight, 2);
ok('Widget: extra Type and Source columns');

w = widget(
  `<table><tr><th>Item</th><th>Weight</th><th>Price</th></tr><tr><td><a href="#widget">Widget</a></td><td>2 lb.</td><td>5 gp</td></tr></table>` +
  sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp'); assert.equal(w.data.weight, 2);
ok('Widget: Weight column before Price');

w = widget(
  `<table><thead><tr><th>Item</th><th>Price</th><th>Weight</th></tr></thead><tbody><tr><td><a href="#widget">Widget</a></td><td>5 gp</td><td>2 lb.</td></tr></tbody></table>` +
  sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp');
ok('Widget: thead/tbody header');

w = widget(
  `<table><tr><th>Item</th><th>Price</th><th>Weight</th></tr><tr><td><a href="#widget">Widget</a></td><td>10,000 gp</td><td>1,000 lbs.</td></tr></table>` +
  sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '10,000 gp'); assert.equal(w.data.weight, 1000);
ok('Widget: 10,000 gp and 1,000 lbs');

// Previously silently empty, must fix
w = widget(
  `<table><tr><td colspan="3">Gadgets</td></tr><tr><th>Item</th><th>Price</th><th>Weight</th></tr><tr><td><a href="#widget">Widget</a></td><td>5 gp</td><td>2 lb.</td></tr></table>` +
  sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp'); assert.equal(w.data.weight, 2);
ok('Widget: group row above the real header');

w = widget(
  `<table><tr><th>Item</th><th>Source</th></tr><tr><td><a href="#widget">Widget</a></td><td>PZO</td></tr></table>` +
  `<table><tr><th>Item</th><th>Price</th><th>Weight</th></tr><tr><td><a href="#widget">Widget</a></td><td>5 gp</td><td>2 lb.</td></tr></table>` +
  sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp');
ok('Widget: two tables, first has no price');

w = widget(
  `<table><tr><th>Item</th><th>Price</th><th>Weight</th></tr><tr><td><a href="#widget">Widget</a></td><td>5 gp</td><td>2 lb.</td></tr></table>` +
  sec('widget', 'Widget', '<p>A widget with no price line.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp'); assert.equal(w.data.weight, 2);
ok('Widget: price only in page-level table');

w = widget(sec('widget', 'Widget', '<p><strong>Price</strong> 5 gp; <strong>Weight</strong> 2 lb.</p><p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp'); assert.equal(w.data.weight, 2);
assert.ok(!/Price/.test(w.data.description), 'stat line not in description');
ok('Widget: <strong> labels');

w = widget(sec('widget', 'Widget', '<p><b>Cost</b> 5 gp; <b>Weight</b> 2 lb.</p><p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp');
ok('Widget: <b>Cost</b> label');

// Wrong row, must fix
w = widget(
  `<table><tr><th>Item</th><th>Price</th><th>Weight</th></tr>` +
  `<tr><td><a href="#gadget">Gadget</a></td><td>1 gp</td><td>1 lb.</td></tr>` +
  `<tr><td><a href="#widget">Widget</a></td><td>5 gp</td><td>2 lb.</td></tr></table>` +
  sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp'); assert.equal(w.data.weight, 2);
ok('Widget: wanted item is second linked row');

w = widget(
  `<table><tr><th>Item</th><th>Price</th><th>Weight</th></tr>` +
  `<tr><td>Weighted widget</td><td>1 gp</td><td>1 lb.</td></tr>` +
  `<tr><td><a href="#widget">Widget</a></td><td>7 gp</td><td>3 lb.</td></tr></table>` +
  sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '7 gp'); assert.equal(w.data.weight, 3);
ok('Widget: "Weighted widget" row not mistaken for header');

// Bad values
w = widget(sec('widget', 'Widget', '<p><b>Price</b>: 5 gp</p><p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp');
ok('Widget: "<b>Price</b>: 5 gp" (no leading colon)');

w = widget(sec('widget', 'Widget', '<p><b>Price</b> 5 gp; <b>Slot</b> none; <b>Weight</b> 2 lb.</p><p>A widget.</p>'), 'widget');
assert.equal(w.data.weight, 2);
ok('Widget: "Price; Slot; Weight"');

for (const [raw, want] of [['½ lb.', 0.5], ['1-1/2 lbs.', 1.5], ['2½ lbs.', 2.5], ['1 lb. per 10 ft.', 1], ['2 lbs.1', 2]]) {
  w = widget(sec('widget', 'Widget', `<p><b>Price</b> 5 gp; <b>Weight</b> ${raw}</p><p>A widget.</p>`), 'widget');
  assert.equal(w.data.weight, want, raw);
}
ok('Widget: fractional and per-unit weights');

w = widget(sec('widget', 'Widget', '<p><b>Price</b> —</p><p>A widget.</p>'), 'widget');
assert.throws(() => G.parseD20pfsrdGearPage(widgetPage(
  sec('widget', 'Widget', '<p><b>Price</b> —</p><p>A widget.</p>')), 
  'https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#widget'), /price or weight/);
ok('Widget: Price "—" throws (no silent dash)');

// Anchors
w = widget(sec('widget', 'Widget', '<p><b>Price</b> 5 gp</p><p>A widget.</p>'), 'TOC-Widget');
assert.equal(w.data.cost, '5 gp');
ok('Widget: #TOC-Widget fragment');

// Codex: repair-cost table must not override the Price line
w = widget(sec('widget', 'Widget',
  '<p><b>Price</b> 5 gp; <b>Weight</b> 2 lb.</p>' +
  '<table><tr><th>Repair</th><th>Cost</th></tr><tr><td>Fix</td><td>99 gp</td></tr></table>' +
  '<p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp'); assert.equal(w.data.weight, 2);
ok('Widget: repair-cost table does not override Price line');

// Description: keep non-price tables, drop price tables
w = widget(sec('widget', 'Widget',
  '<p><b>Price</b> 5 gp</p><table><tr><th>Size</th><th>Bonus</th></tr><tr><td>Small</td><td>+1</td></tr></table><p>A widget.</p>'), 'widget');
assert.ok(w.data.description.includes('Small | +1'), 'rules table kept as text');
ok('Widget: non-price table kept in description');

// ---- URL routing ----
const K = D.d20pfsrdKindForUrl;
for (const host of ['www.d20pfsrd.com', 'd20pfsrd.com']) {
  assert.equal(K(`https://${host}/equipment/goods-and-services/tools-kits/`), 'gear');
  assert.equal(K(`https://${host}/equipment/goods-and-services/tools-kits/#widget`), 'gear');
  assert.equal(K(`https://${host}/equipment/3rd-party-equipment/3rd-party-goods-and-services/`), 'gear');
}
assert.equal(K('https://www.d20pfsrd.com/equipment/goods-and-services/'), null, 'index rejected');
assert.equal(K('https://www.d20pfsrd.com/equipment/goods-and-services/hirelings-servants-services/extra/'), null, '4 segments rejected');
assert.equal(K('https://www.d20pfsrd.com/equipment/weapons/'), null, 'weapons not gear');
ok('url routing');

// ---- Rejections ----
assert.throws(() => G.parseD20pfsrdGearPage(fx('hunting-camping-survival-gear.html'), U.multi), /lists .* items/, 'multi-item without fragment');
assert.throws(() => G.parseD20pfsrdGearPage(fx('hunting-camping-survival-gear.html'), U.bedroll.replace('#bedroll', '#nope')), /No item/, 'bad fragment');
ok('rejections');

console.log(`\n${count} d20pfsrd gear checks passed`);

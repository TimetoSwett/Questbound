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
const M = await import('../lib/d20pfsrd/messages.ts');
const fx = (f) => readFileSync(new URL(`./fixtures/d20pfsrd/${f}`, import.meta.url), 'utf8');
const U = {
  bedroll: 'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/#bedroll',
  tent: 'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/#TOC-Tent',
  bat: 'https://www.d20pfsrd.com/equipment/goods-and-services/animals-animal-gear/#bat',
  chain: 'https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#chain',
  thieves: 'https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#TOC-Tools-Thieves-',
  thievesSpan: 'https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#tools_thieves8217',
  breakaway: 'https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#chain_breakaway',
  hook: 'https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#hook_grappling',
  wax: 'https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#key_wax_blank',
  toad: 'https://www.d20pfsrd.com/equipment/goods-and-services/animals-animal-gear/#toad_common',
  barding: 'https://www.d20pfsrd.com/equipment/goods-and-services/animals-animal-gear/#barding',
  straw: 'https://www.d20pfsrd.com/equipment/3rd-party-equipment/3rd-party-goods-and-services/rite-publishing/backpack-straw/',
  deodorizer: 'https://www.d20pfsrd.com/equipment/3rd-party-equipment/3rd-party-goods-and-services/adamant-entertainment/deodorizer/',
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

const bat = gear('animals-animal-gear.html', U.bat);
assert.equal(bat.data.cost, '5 gp'); assert.equal(bat.data.weight, 1);
ok('Bat = 5 gp, 1 lb');

const battery = gear('technological-gear.html', U.battery);
assert.equal(battery.data.weight, 1, 'Battery = 1 lb (Price; Slot; Weight line)');
assert.equal(battery.data.cost, '100 gp');
assert.ok(!/CONSTRUCTION|Craft Technological Item/.test(battery.data.description.slice(0, 40)));
ok('Battery weight from Price/Slot/Weight line');

const br = gear('hunting-camping-survival-gear.html', U.bedroll);
assert.equal(br.name, 'Bedroll'); assert.equal(br.data.cost, '1 sp'); assert.equal(br.data.weight, 5);
ok('Bedroll = 1 sp, 5 lb');

for (const u of [U.thieves, U.thievesSpan]) {
  const th = gear('tools-kits.html', u);
  // In-section variant table (Common row), not the Concealable Price line inside the <ul>.
  assert.equal(th.data.cost, '30 gp'); assert.equal(th.data.weight, 1);
  assert.ok(th.data.description.includes('Disable Device'));
}
ok("Thieves' Tools = 30 gp, 1 lb via #TOC-Tools-Thieves- and #tools_thieves8217");

const ba = gear('tools-kits.html', U.breakaway);
assert.equal(ba.data.cost, '65 gp'); assert.equal(ba.data.weight, 2);
ok('Chain, Breakaway = 65 gp via name match ("Chains, breakaway" row links #TOC-Chain)');

const hook = gear('tools-kits.html', U.hook);
assert.equal(hook.data.cost, '1 gp'); assert.equal(hook.data.weight, 4);
ok('Hook, Grappling = 1 gp, 4 lb (variant table, a id= anchor)');

const wax = gear('tools-kits.html', U.wax);
assert.equal(wax.data.cost, '15 gp'); assert.equal(wax.data.weight, 0.5);
ok('Key, Wax Blank = 15 gp via "Key blank, wax" word match');

const toad = gear('animals-animal-gear.html', U.toad);
assert.equal(toad.data.cost, '2 cp'); assert.equal(toad.data.weight, 0.4375);
ok('Toad (Common) = 2 cp, 7 oz.');

assert.throws(() => G.parseD20pfsrdGearPage(fx('animals-animal-gear.html'), U.barding), /price or weight/);
ok('Barding "×2" multiplier is not a price (throws)');

// 3rd-party goods: one item per page under a publisher
const straw = D.parseD20pfsrdPage(fx('3pp-goods-backpack-straw.html'), U.straw); check(straw);
assert.equal(straw.name, 'Backpack, Straw'); assert.equal(straw.data.cost, '2 cp');
assert.equal(straw.data.weight, 0, 'page lists no weight; "20 lbs. worth of material" is capacity, not weight');
assert.ok(straw.data.description.includes('woven straw basket'));
const deo = D.parseD20pfsrdPage(fx('3pp-goods-deodorizer.html'), U.deodorizer); check(deo);
assert.equal(deo.name, 'Deodorizer'); assert.equal(deo.data.cost, '25 gp', '"25gp" normalized');
ok('3pp goods: Backpack, Straw = 2 cp, no weight; Deodorizer = 25 gp (full pages)');

const pp = G.parseD20pfsrdGearPage(
  '<html><body><div id="article-content"><h1>Widget, Folding</h1><p>A folding widget.</p><p><b>Cost</b>: 12GP<br><b>Weight</b> 3 lbs.</p></div></body></html>',
  'https://www.d20pfsrd.com/equipment/3rd-party-equipment/3rd-party-goods-and-services/some-publisher/widget-folding/');
check(pp); assert.equal(pp.data.cost, '12 gp'); assert.equal(pp.data.weight, 3);
ok('3pp single page: Weight line after the Cost line is parsed; "12GP" -> "12 gp"');

// Shared anchors: ambiguous rows throw instead of taking the first row
assert.throws(() => G.parseD20pfsrdGearPage(fx('hunting-camping-survival-gear.html'),
  'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/#ale_luglurch'), /"Ale, Luglurch" has 2 different price rows .*1 gp.*4 sp.*ambiguous/);
ok('Ale, Luglurch (two rows: 1 gp / 4 sp) throws ambiguous');
assert.throws(() => G.parseD20pfsrdGearPage(fx('hunting-camping-survival-gear.html'),
  'https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/#food_lodging_aka_monthly_cost_of_living'), /is a service, not gear/);
ok('Food & Lodging heading on a gear page is rejected as a service');
const mam = gear('animals-animal-gear.html', 'https://www.d20pfsrd.com/equipment/goods-and-services/animals-animal-gear/#woolly_mammoth');
assert.equal(mam.data.cost, '3,000 gp'); assert.equal(mam.data.weight, 12000);
ok('Woolly Mammoth: training-table repeat with no weight agrees with the main row');

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

assert.throws(() => G.parseD20pfsrdGearPage(widgetPage(
  sec('widget', 'Widget', '<p><b>Price</b> —</p><p>A widget.</p>')), 
  'https://www.d20pfsrd.com/equipment/goods-and-services/tools-kits/#widget'), /price or weight/);
ok('Widget: Price "—" throws (no silent dash)');

w = widget(sec('widget', 'Widget', '<p>A widget, hired by the day. <b>Price</b> 1 gp</p>'), 'widget');
assert.equal(w.data.cost, '1 gp');
ok('Widget: Price at the end of a paragraph (Valet)');

for (const [raw, want] of [['1–1/2 lbs.', 1.5], ['8 oz.', 0.5], ['3 tons', 6000], ['1 lb.–8 lbs.', 1], ['20 lbs.<sup>1</sup>', 20]]) {
  w = widget(`<table><tr><th>Item</th><th>Price</th><th>Weight</th></tr><tr><td><a href="#widget">Widget</a></td><td>5 gp</td><td>${raw}</td></tr></table>` +
    sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
  assert.equal(w.data.weight, want, raw);
}
ok('Widget: en-dash fractions, oz, tons, ranges, footnotes');

w = widget(`<table><tr><th>Item</th><th>Price</th><th>Weight</th></tr><tr><td><a href="#widget">Widget</a></td><td>5 gp</td><td>2 lbs.</td></tr></table>` +
  sec('widget', 'Widget', '<p>A widget.</p>') +
  `<p><a name="table-next"></a></p><table><tr><th>Item</th><th>Price</th><th>Weight</th></tr><tr><td><a href="#gadget">Gadget</a></td><td>1 sp</td><td>—</td></tr></table>`, 'widget');
assert.equal(w.data.cost, '5 gp'); assert.equal(w.data.weight, 2);
ok('Widget: next category table after the last item is not its variant table (Tent)');

w = widget(sec('widget', 'Widget', '<p>A widget.</p><ul><li><i>Fancy</i>: <b>Price</b> 99 gp; <b>Weight</b> 9 lbs.</li></ul>') +
  `<table><tr><th>Item</th><th>Price</th><th>Weight</th></tr><tr><td><a href="#widget">Widget</a></td><td>5 gp</td><td>2 lbs.</td></tr></table>`, 'widget');
assert.equal(w.data.cost, '5 gp'); assert.equal(w.data.weight, 2);
ok('Widget: variant Price line inside <ul> does not win');

const shared = (rows) => `<table><tr><th>Item</th><th>Price</th><th>Weight</th></tr>${rows.map(([n, p]) => `<tr><td><a href="#TOC-Widget">${n}</a></td><td>${p}</td><td>1 lb.</td></tr>`).join('')}</table>`;
assert.throws(() => widget(shared([['Gizmo', '1 gp'], ['Doohickey', '2 gp']]) + sec('widget', 'Widget', '<p>A widget.</p>'), 'widget'), /2 different price rows .*ambiguous/);
ok('Widget: shared anchor, rows for other items -> throws (no first-row guess)');
w = widget(shared([['Widget, small', '1 gp'], ['Widget, large', '2 gp']]) + sec('widget', 'Widget', '<p>A widget.</p>'), 'widget');
assert.equal(w.name, 'Widget, small'); assert.equal(w.data.cost, '1 gp');
ok('Widget: variant family "Widget, small/large" -> base row, named for it (Tent, small)');
assert.throws(() => widget(shared([['Widget', '1 gp'], ['Widget', '2 gp']]) + sec('widget', 'Widget', '<p>A widget.</p>'), 'widget'), /ambiguous/);
ok('Widget: two exact-name rows with different prices -> throws');
w = widget(sec('widget', 'Widget', '<p><b>Price</b> 5 GP; <b>Weight</b> 1 lb.</p><p>A widget.</p>'), 'widget');
assert.equal(w.data.cost, '5 gp');
ok('Widget: coin units normalized ("5 GP" -> "5 gp")');

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
  assert.equal(K(`https://${host}/equipment/3rd-party-equipment/3rd-party-goods-and-services/rite-publishing/backpack-straw/`), 'gear');
  assert.equal(K(`https://${host}/equipment/3rd-party-equipment/3rd-party-goods-and-services/`), null, '3pp index has no items');
  assert.equal(K(`https://${host}/equipment/3rd-party-equipment/3rd-party-goods-and-services/rite-publishing/`), null, 'publisher index');
}
assert.equal(K('https://www.d20pfsrd.com/equipment/goods-and-services/'), null, 'index rejected');
assert.equal(K('https://www.d20pfsrd.com/equipment/goods-and-services/hirelings-servants-services/extra/'), null, '4 segments rejected');
assert.equal(K('https://www.d20pfsrd.com/equipment/weapons/'), null, 'weapons not gear');
ok('url routing');

// ---- Services pages: not gear ----
for (const u of [
  'https://www.d20pfsrd.com/equipment/goods-and-services/hirelings-servants-services/#hirelings',
  'https://www.d20pfsrd.com/equipment/goods-and-services/hirelings-servants-services/#valet',
  'https://www.d20pfsrd.com/equipment/goods-and-services/hirelings-servants-services/',
]) {
  assert.equal(G.isServicesGearPath(u), true);
  assert.throws(() => D.parseD20pfsrdPage(fx('hunting-camping-survival-gear.html'), u), /lists services .*not gear/);
}
assert.equal(G.isServicesGearPath(U.chain), false);
assert.equal(G.isServicesGearPath('https://www.d20pfsrd.com/equipment/goods-and-services/hunting-camping-survival-gear/#bedroll'), false);
ok('hirelings-servants-services rejected as not gear (#hirelings, #valet, page)');

// ---- Messages module: shared texts, no import cycle ----
assert.equal(D.D20PFSRD_UNSUPPORTED, M.D20PFSRD_UNSUPPORTED); assert.equal(D.HINT, M.HINT);
const gearSrc = readFileSync(new URL('../lib/d20pfsrd/gear.ts', import.meta.url), 'utf8');
const msgSrc = readFileSync(new URL('../lib/d20pfsrd/messages.ts', import.meta.url), 'utf8');
assert.ok(!/from ['"]\.\.\/d20pfsrd-parser['"]/.test(gearSrc), 'gear.ts must not import d20pfsrd-parser');
assert.ok(!/^\s*import\b/m.test(msgSrc), 'messages.ts is a leaf module');
ok('messages.ts shared by parser and gear.ts; no cycle');

// ---- Rejections ----
assert.throws(() => G.parseD20pfsrdGearPage(fx('hunting-camping-survival-gear.html'), U.multi), /lists .* items/, 'multi-item without fragment');
assert.throws(() => G.parseD20pfsrdGearPage(fx('hunting-camping-survival-gear.html'), U.bedroll.replace('#bedroll', '#nope')), /No item/, 'bad fragment');
assert.throws(() => D.parseD20pfsrdPage(fx('3pp-goods-and-services.html'), 'https://www.d20pfsrd.com/equipment/3rd-party-equipment/3rd-party-goods-and-services/'), /only\. Open a single/, '3pp index rejected');
// Sidebar widget h4s ("Discuss!") are not items: the count is the real item count.
assert.throws(() => G.parseD20pfsrdGearPage(fx('hunting-camping-survival-gear.html'), U.multi), /lists 77 items/);
ok('rejections');

console.log(`\n${count} d20pfsrd gear checks passed`);

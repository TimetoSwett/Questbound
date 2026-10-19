// Offline endpoint + edge-case regressions. No database or live source requests.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const S = await import('../lib/spell-item-import.ts');
const L = await import('../lib/library.ts');
const A = await import('../lib/aon-catalog-parser.ts');
const D = await import('../lib/d20pfsrd-parser.ts');
const Armor = await import('../lib/d20pfsrd/armor.ts');
const fx = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const mm = 'https://aonprd.com/SpellDisplay.aspx?ItemName=Magic%20Missile';
const fb = 'https://www.d20pfsrd.com/magic/all-spells/f/fireball/';
const weapon = 'https://aonprd.com/MagicWeaponsDisplay.aspx?ItemName=Arachnid%27s%20Fang';
const rod = 'https://www.d20pfsrd.com/magic-items/rods/metamagic-rods/metamagic-extend/';
const fixtures = new Map([[mm, fx('aon/magic-missile.html')], [fb, fx('d20pfsrd/fireball.html')], [weapon, fx('aon/weapon.html')], [rod, fx('d20pfsrd/metamagic-rods/metamagic-extend.html')]]);
const fetched = [];
let signedIn = true;
const mocks = {
  'next/server': { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), { status: options?.status ?? 200 }) } },
  '@/lib/spell-item-import': S,
  '@/lib/aon-catalog-parser': A,
  '@/lib/d20pfsrd-parser': D,
  '@/lib/d20pfsrd/armor': Armor,
  '@/lib/library': L,
  '@/lib/library-api': {
    requireActor: async () => signedIn ? { actor: { id: 'tester' } } : { res: new Response('', { status: 401 }) },
    readBoundedJson: async (request) => ({ body: await request.json() }),
  },
  '@/lib/statblock-rate-limit': { importRateLimited: () => false },
  '@/lib/statblock-fetch': { fetchStatblockHtml: async (url) => { fetched.push(url); assert.ok(fixtures.has(url), `unexpected fetch ${url}`); return { html: fixtures.get(url) }; } },
};
const src = readFileSync(new URL('../app/api/library/import/route.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {};
runInNewContext(js, { exports, console, Response, require: (name) => { assert.ok(name in mocks, name); return mocks[name]; } });
const post = (body) => exports.POST(new Request('https://questbound.test/api/library/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));

for (const [body, expected] of [
  [{ url: mm, itemType: 'wand', cl: 3, charges: 10 }, { name: 'Wand of Magic Missile (CL 3)', cost: '450 gp', charges: 10, level: 1 }],
  [{ url: fb, itemType: 'scroll', cl: 5 }, { name: 'Scroll of Fireball (CL 5)', cost: '375 gp', charges: 1, level: 3 }],
]) {
  const res = await post(body);
  assert.equal(res.status, 200);
  const { draft } = await res.json();
  assert.equal(draft.name, expected.name);
  assert.equal(draft.data.cost, expected.cost);
  assert.equal(draft.data.spellItem.charges, expected.charges);
  assert.equal(draft.data.spellItem.spellLevel, expected.level);
  assert.equal(draft.kind, 'gear');
  assert.equal(draft.spellLevels, undefined);
}
assert.equal((await (await post({ url: weapon })).json()).draft.data.cost, '18,302 gp');
assert.equal((await (await post({ url: rod })).json()).drafts.length, 3, 'metamagic versions still reach the endpoint');
for (const body of [
  { url: mm, itemType: 'wand', cl: 3 },
  { url: mm, itemType: 'wand', cl: 3, charges: 51 },
  { url: mm, itemType: 'wand', cl: 0, charges: 50 },
  { url: mm, itemType: 'wand', cl: 3, charges: 50, componentCostGp: -1 },
  { url: mm, itemType: 'scroll', cl: 3, charges: 2 },
  { url: mm, itemType: 'potion', cl: 3 },
  { url: weapon, itemType: 'wand', cl: 3, charges: 50 },
]) {
  const before = fetched.length;
  assert.equal((await post(body)).status, 400);
  assert.equal(fetched.length, before, 'bad options rejected before fetching');
}
signedIn = false;
assert.equal((await post({ url: mm, itemType: 'wand', cl: 3, charges: 50 })).status, 401);

const options = { itemType: 'wand', cl: 1, charges: 50 };
const cantrip = S.parseSpellItemImport(fx('aon/detect-magic.html'), 'https://aonprd.com/SpellDisplay.aspx?ItemName=Detect%20Magic', options);
assert.equal(cantrip.data.cost, '375 gp');
assert.equal(cantrip.data.spellItem.spellLevel, 0);
assert.equal(L.spellItemCost({ ...cantrip.data.spellItem, type: 'scroll', charges: 1 }, 1), '12.5 gp');
assert.equal(L.spellItemCost({ ...cantrip.data.spellItem, charges: 1 }, 1), '7.5 gp');
assert.throws(() => S.parseSpellItemImport(fx('aon/wish.html'), 'https://aonprd.com/SpellDisplay.aspx?ItemName=Wish', options), /4th level/);
const wish = S.parseSpellItemImport(fx('aon/wish.html'), 'https://aonprd.com/SpellDisplay.aspx?ItemName=Wish', { itemType: 'scroll', cl: 17, componentCostGp: 25000 });
assert.equal(wish.data.cost, '28,825 gp');
const multi = S.parseSpellItemImport(fx('aon/absorb-rune-ii.html'), 'https://aonprd.com/SpellDisplay.aspx?ItemName=Absorb%20Rune%20II', { itemType: 'scroll', cl: 7 });
assert.match(multi.name, /Absorb Rune II \(CL 7\)/, 'URL selects the intended spell on a multi-spell page');
console.log('SPELL ITEM ENDPOINT, CANTRIPS, COMPONENTS, AND MULTI-SPELL PAGES: PASS');

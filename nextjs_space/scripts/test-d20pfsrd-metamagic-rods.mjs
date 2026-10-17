#!/usr/bin/env -S npx tsx
// d20pfsrd.com metamagic rod tests (offline, saved fixtures under scripts/fixtures/d20pfsrd/metamagic-rods).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const D = await import('../lib/d20pfsrd-parser.ts');
const L = await import('../lib/library.ts');
const fx = (f) => readFileSync(new URL(`./fixtures/d20pfsrd/${f}`, import.meta.url), 'utf8');
const BASE = 'https://www.d20pfsrd.com/magic-items/rods/metamagic-rods/';
let count = 0;
const ok = (m) => { count++; console.log(`ok   ${m}`); };

const PAGES = [
  { file: 'metamagic-rods/metamagic-extend.html', slug: 'metamagic-extend', title: 'Metamagic Rod, Extend', costs: ['3,000 gp', '11,000 gp', '24,500 gp'], cons: ['1,500 gp', '5,500 gp', '12,250 gp'], prose: 'up to three spells per day that are extended', feats: 'Craft Rod, Extend Spell' },
  { file: 'metamagic-rods/metamagic-quicken.html', slug: 'metamagic-quicken', title: null, costs: ['35,000 gp', '75,500 gp', '170,000 gp'], cons: ['17,500 gp', '37,750 gp', '85,000 gp'], prose: null, feats: 'Craft Rod' },
  { file: 'metamagic-rods/familiar-spell-metamagic-rod.html', slug: 'familiar-spell-metamagic-rod', title: 'Metamagic Rod, Familiar', costs: ['14,000 gp', '54,000 gp', '121,500 gp'], cons: ['7,000 gp', '27,000 gp', '60,750 gp'], prose: null, feats: 'Craft Rod, Familiar Spell' },
  { file: 'metamagic-rods/metamagic-rod-apocalyptic.html', slug: 'metamagic-rod-apocalyptic', title: 'Metamagic Rod, Apocalyptic', costs: ['3,000 gp', '11,000 gp', '24,500 gp'], cons: ['1,500 gp', '5,500 gp', '12,250 gp'], prose: 'blast terrain', feats: 'Craft Rod, Apocalyptic Spell*', slot: 'Slot none' },
];

function check(d) {
  const r = L.parseCreateInput(d);
  assert.equal(r.ok, true, r.ok ? '' : JSON.stringify(r.error));
  assert.equal(d.kind, 'gear'); L.gearDataSchema.parse(d.data);
  assert.ok(d.summary && !d.summary.includes('\n'));
  for (const s of [d.name, d.summary, ...Object.values(d.data).flat()].filter((x) => typeof x === 'string')) {
    assert.ok(!/<\/?[a-z][^>]*>/i.test(s), `HTML left in: ${s.slice(0, 80)}`);
    assert.ok(!/&(#\d+|[a-z]+);/i.test(s), 'undecoded entity');
    assert.ok(!/Section 15|Copyright/i.test(s));
  }
}

for (const p of PAGES) {
  const url = BASE + p.slug + '/';
  const html = fx(p.file);
  assert.equal(D.d20pfsrdKindForUrl(url), 'gear');
  const drafts = D.parseD20pfsrdDrafts(html, url);
  assert.equal(drafts.length, 3, p.slug);
  const base = drafts[1].name;
  assert.match(base, /^Metamagic Rod, \S/);
  if (p.title) assert.equal(base, p.title);
  assert.deepEqual(drafts.map((d) => d.name), [`${base} (Lesser)`, base, `${base} (Greater)`]);
  assert.equal(new Set(drafts.map((d) => d.name)).size, 3);
  drafts.forEach((d, i) => {
    check(d);
    assert.equal(d.sourceUrl, url);
    assert.equal(d.data.cost, p.costs[i]);
    assert.equal(d.data.cl, 17); assert.equal(d.data.aura, 'strong (no school)');
    assert.equal(d.data.weight, 5); assert.equal(d.data.slot, 'slotless');
    const desc = d.data.description;
    assert.ok(desc.includes(`Price ${p.costs[i]}`));
    const [head, ...rest] = desc.split('\n\nConstruction\n');
    assert.equal(rest.length, 1);
    assert.ok(rest[0].includes(`Cost ${p.cons[i]}`), `${p.slug} v${i} construction cost`);
    assert.ok(rest[0].includes(p.feats), `${p.slug} feats`);
    assert.match(head, /Aura strong \(no school\)/); assert.match(head, /CL 17th/);
    if (p.slot) assert.ok(head.includes(p.slot));
    for (let j = 0; j < 3; j++) if (j !== i) {
      const has = (amount) => new RegExp(`(^|[^\\d,])${amount}`).test(desc); // "7,000 gp" is not inside "27,000 gp"
      assert.ok(!has(p.costs[j]), `${p.slug} v${i} has price of v${j}`);
      assert.ok(!has(p.cons[j]), `${p.slug} v${i} has cost of v${j}`);
    }
    if (p.prose) assert.ok(desc.includes(p.prose));
    assert.ok(!/Lesser .*rod \d|varies/i.test(desc.replace(/Price varies/, '')), 'version list left in description');
    assert.ok(desc.includes(d.summary.replace(/…$/, '').slice(0, 30)), 'summary comes from the prose');
    assert.equal(d.summary, drafts[0].summary);
    assert.ok(!/spell level|level or lower/i.test(desc), 'no invented spell-level limit');
  });
  ok(`${p.slug}: three versions`);

  // fragment selection, www and bare host
  const frags = { lesser: 0, normal: 1, standard: 1, regular: 1, greater: 2 };
  for (const host of ['https://www.d20pfsrd.com', 'https://d20pfsrd.com']) {
    for (const [f, idx] of Object.entries(frags)) {
      for (const fr of [f, f.toUpperCase()]) {
        const u = `${host}/magic-items/rods/metamagic-rods/${p.slug}/#${fr}`;
        const got = D.parseD20pfsrdDrafts(html, u);
        assert.equal(got.length, 1, u);
        assert.equal(got[0].name, drafts[idx].name); assert.equal(got[0].data.cost, p.costs[idx]);
        assert.equal(got[0].data.description, drafts[idx].data.description);
        assert.equal(D.parseD20pfsrdPage(html, u).name, drafts[idx].name);
      }
    }
  }
  assert.throws(() => D.parseD20pfsrdDrafts(html, url + '#bogus'), /Unknown metamagic rod version '#bogus'. Use #lesser, #normal or #greater\./);
  assert.equal(D.parseD20pfsrdPage(html, url).name, drafts[0].name);
  assert.equal(D.parseD20pfsrdPage(html, url + '#').name, drafts[0].name);
  ok(`${p.slug}: fragments`);
}

// routing
assert.equal(D.d20pfsrdKindForUrl(BASE), null);
assert.equal(D.d20pfsrdKindForUrl('https://www.d20pfsrd.com/magic-items/rods/metamagic-rods'), null);
assert.equal(D.d20pfsrdKindForUrl(BASE + 'metamagic-extend/extra/'), null);
assert.equal(D.d20pfsrdKindForUrl(BASE + 'a/b/c/'), null);
assert.equal(D.d20pfsrdKindForUrl('https://www.d20pfsrd.com/magic-items/rods/crypt-rod/'), 'gear');
assert.equal(D.d20pfsrdKindForUrl('https://www.d20pfsrd.com/magic-items/rods/metamagic-rods-other/x/'), null);
ok('routing');

// non-metamagic pages: exactly one draft, same as parseD20pfsrdPage; fragments stay ignored
const crypt = 'https://www.d20pfsrd.com/magic-items/rods/crypt-rod/';
const html = fx('crypt-rod.html');
const one = D.parseD20pfsrdDrafts(html, crypt);
assert.equal(one.length, 1);
assert.deepEqual(one[0], D.parseD20pfsrdPage(html, crypt));
assert.equal(D.parseD20pfsrdDrafts(html, crypt + '#bogus').length, 1);
ok('non-metamagic pages unchanged');

console.log(`\n${count} groups passed`);

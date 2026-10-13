#!/usr/bin/env -S npx tsx
// AoN spell parser + polite fetcher tests (offline, saved fixtures under scripts/fixtures/aon).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const P = await import('../lib/aon-spell-parser.ts');
const L = await import('../lib/library.ts');
const { createPoliteFetcher, createExporter, readExportFile, loadFromFile } = await import('./import-aon-spells.ts');
const deepJson = (a, b) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
const fx = (f) => readFileSync(new URL(`./fixtures/aon/${f}`, import.meta.url), 'utf8');

// index
const idx = P.parseSpellIndex(fx('spells-index-head.html'));
assert.equal(idx.length, 40);
assert.deepEqual(idx[0], { name: "Abadar's Truthtelling", url: 'https://aonprd.com/SpellDisplay.aspx?ItemName=Abadar%27s%20Truthtelling', summary: 'Force the target to speak the truth.' });
assert.equal(idx[1].name, 'Abeyance', 'superscript markers stripped');
assert.ok(idx.every((i) => i.name && i.url.startsWith('https://aonprd.com/SpellDisplay.aspx?ItemName=')));
console.log('ok   index');

// pages
const fb = P.parseSpellPage(fx('fireball.html'));
assert.equal(fb.name, 'Fireball');
assert.deepEqual(fb.data.descriptors, ['fire']);
assert.equal(fb.data.school, 'evocation'); assert.equal(fb.data.subschool, '');
assert.equal(fb.data.castingTime, '1 standard action');
assert.equal(fb.data.components, 'V, S, M (a ball of bat guano and sulfur)');
assert.equal(fb.data.range, 'long (400 ft. + 40 ft./level)');
assert.equal(fb.data.areaTargetEffect, 'Area: 20-ft.-radius spread');
assert.equal(fb.data.duration, 'instantaneous'); assert.equal(fb.data.savingThrow, 'Reflex half'); assert.equal(fb.data.spellResistance, 'yes');
assert.ok(fb.data.description.startsWith('A fireball spell generates'));
assert.ok(!/Mythic|Controlled Fireball|bead of fire to originate/.test(fb.data.description), 'only the first spell, no mythic/related blocks');
assert.ok(fb.data.description.includes('\n\n'), 'paragraphs kept');
assert.deepEqual(fb.spellLevels.find((l) => l.cls === 'wizard'), { cls: 'wizard', level: 3 });
const clw = P.parseSpellPage(fx('cure-light-wounds.html'));
assert.equal(clw.data.subschool, 'healing'); assert.equal(clw.data.areaTargetEffect, 'Target: creature touched');
assert.deepEqual(clw.spellLevels.find((l) => l.cls === 'ranger'), { cls: 'ranger', level: 2 });
const mm = P.parseSpellPage(fx('magic-missile.html'));
assert.ok(mm.data.areaTargetEffect.startsWith('Targets: up to five creatures'));
const dm = P.parseSpellPage(fx('detect-magic.html'));
assert.ok(dm.spellLevels.some((l) => l.cls === 'summoner (unchained)' && l.level === 0));
assert.equal(dm.data.duration, 'concentration, up to 1 min./level (D)');
const wish = P.parseSpellPage(fx('wish.html'));
assert.equal(wish.data.areaTargetEffect, 'Target, Effect, or Area: see text');
assert.equal(wish.data.school, 'universal');
for (const s of [fb, clw, mm, dm, wish]) {
  L.spellDataSchema.parse(s.data);
  L.spellLevelsSchema.parse(s.spellLevels);
  assert.ok(!/[<>]/.test(s.data.description.replace(/[<>]=?\s?\d/g, '')), `no HTML left in ${s.name}`);
}
const ar = P.parseSpellPage(fx('absorb-rune-ii.html'), 'Absorb Rune II');
assert.equal(ar.name, 'Absorb Rune II');
assert.equal(P.parseSpellPage(fx('absorb-rune-ii.html'), 'absorb  rune iii').name, 'Absorb Rune III');
assert.equal(P.parseSpellPage(fx('absorb-rune-ii.html')).name, 'Absorb Rune I', 'default: first block');
assert.ok(ar.spellLevels.length > 0); assert.notEqual(ar.data.description, P.parseSpellPage(fx('absorb-rune-ii.html'), 'Absorb Rune I').data.description);
assert.throws(() => P.parseSpellPage(fx('fireball.html'), 'Wish'), /not found on page/);
assert.equal(P.parseSpellPage(fx('fireball.html'), 'Controlled Fireball').data.descriptors.join(), 'fire,ruse');
console.log('ok   pages (6 fixtures validate; multi-spell pages pick the named block)');

// helpers
assert.deepEqual(P.parseLevels('sorcerer/wizard 3, cleric/oracle 2, wizard 4, summoner (unchained) 1'), [{ cls: 'sorcerer', level: 3 }, { cls: 'wizard', level: 3 }, { cls: 'cleric', level: 2 }, { cls: 'oracle', level: 2 }, { cls: 'summoner (unchained)', level: 1 }]);
assert.deepEqual(P.parseSchool('conjuration (summoning) [chaotic, evil]'), { school: 'conjuration', subschool: 'summoning', descriptors: ['chaotic', 'evil'] });
assert.deepEqual(P.parseSchool('enchantment (compulsion) [language-dependent, mind-affecting]').descriptors, ['language-dependent', 'mind-affecting']);
assert.equal(P.decodeEntities('a&amp;b &#8217; &#x2014; &nbsp;'), 'a&b ’ —  ');
assert.throws(() => P.parseSpellPage('<html>Server Error</html>'), /No spell title/);
assert.throws(() => P.parseSpellPage('<h1 class="title">X</h1><b>Level</b> wizard 1'), /No School/);
assert.equal(P.spellUrl("SpellDisplay.aspx?ItemName=Abadar's Truthtelling"), 'https://aonprd.com/SpellDisplay.aspx?ItemName=Abadar%27s%20Truthtelling');
console.log('ok   helpers');

// polite fetcher: spacing, 429 Retry-After, 5xx backoff, give up on 404 (fake clock, fake network)
{
  let t = 0; const sleeps = []; const calls = [];
  const sleepImpl = async (ms) => { sleeps.push(ms); t += ms; };
  const page = '<html>ok</html>';
  const script = [{ status: 429, headers: { 'retry-after': '42' } }, { status: 503 }, { status: 200 }, { status: 200 }, { status: 404 }];
  const fetchImpl = async (url, init) => {
    calls.push({ t, ua: init.headers['User-Agent'] });
    const s = script.shift();
    return new Response(s.status === 200 ? page : 'x', { status: s.status, headers: s.headers });
  };
  // Bypass DNS in the guarded fetcher by stubbing node:dns via a resolvable host: aonprd.com real DNS is used, so
  // only run if DNS works; otherwise skip this block.
  const pf = createPoliteFetcher(2000, { fetchImpl, sleepImpl, now: () => t, log: () => {}, resolver: async () => [{ address: '93.184.216.34' }] });
  let ran = true;
  try { assert.equal(await pf.get('https://aonprd.com/SpellDisplay.aspx?ItemName=A'), page); }
  catch (e) { if (/DNS|ENOTFOUND|EAI_AGAIN/.test(String(e))) ran = false; else throw e; }
  if (ran) {
    assert.ok(sleeps.includes(42_000), 'honors Retry-After');
    assert.ok(sleeps.includes(10_000), '5xx exponential backoff (5s * 2^1)');
    await pf.get('https://aonprd.com/SpellDisplay.aspx?ItemName=B');
    const gap = calls[3].t - calls[2].t;
    assert.ok(gap >= 2000, `spacing >= delay (${gap})`);
    await assert.rejects(pf.get('https://aonprd.com/SpellDisplay.aspx?ItemName=C'), /HTTP 404/);
    assert.equal(calls.length, 5, '404 is not retried');
    assert.ok(calls.every((c) => /QuestboundSpellImporter/.test(c.ua)), 'polite UA');
    await assert.rejects(pf.get('https://evil.example.com/x'), /Blocked host/);
    console.log('ok   polite fetcher');
  } else console.log('skip polite fetcher (no DNS)');
}
// export -> load round trip (temp file, in-memory DB mock implementing the upsert surface)
{
  const { mkdtempSync, appendFileSync: app, readFileSync: rf } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = `${mkdtempSync(`${tmpdir()}/aon-export-`)}/spells.jsonl`;
  const recs = ['fireball.html', 'magic-missile.html', 'wish.html'].map((f, i) => {
    const p = P.parseSpellPage(fx(f));
    return { kind: 'spell', system: 'pf1e', name: p.name, summary: i === 2 ? '' : `Summary ${i}`, sourceUrl: P.spellUrl(`SpellDisplay.aspx?ItemName=${p.name}`), data: L.spellDataSchema.parse(p.data), spellLevels: p.spellLevels };
  });
  let ex = createExporter(path);
  assert.equal(ex.write(recs[0]), true);
  assert.equal(ex.write(recs[0]), false, 'no dupes in one run');
  app(path, JSON.stringify(recs[1]).slice(0, 50)); // simulate a kill mid-write (torn line)
  ex = createExporter(path); // resume
  assert.equal(ex.write(recs[0]), false, 'no dupes across resume');
  assert.equal(ex.write(recs[1]), true); assert.equal(ex.write(recs[2]), true);
  const read = readExportFile(path);
  assert.equal(read.records.length, 3); assert.equal(read.bad.length, 1, 'torn line reported, not fatal');
  assert.ok(rf(path, 'utf8').endsWith('\n'));
  deepJson(read.records[0], recs[0]);
  // in-memory db
  const rows = new Map(); let n = 0;
  const key = (w) => `${w.kind}|${w.system}|${w.nameKey}`;
  const db = {
    libraryEntry: {
      findUnique: async ({ where }) => { const r = rows.get(key(where.kind_system_nameKey)); return r ? { id: r.id, source: r.source } : null; },
      create: async ({ data }) => { const r = { ...data, id: `id${++n}`, spellLevels: data.spellLevels.create }; rows.set(key(r), r); return { id: r.id }; },
      update: async ({ where, data }) => { const r = [...rows.values()].find((x) => x.id === where.id); Object.assign(r, data, data.spellLevels ? { spellLevels: data.spellLevels.create } : {}); return r; },
    },
    spellLevel: { deleteMany: async () => ({}) },
  };
  let res = await loadFromFile(db, path);
  deepJson(res.counts, { invalid: 1, created: 3 });
  const fbRow = rows.get('spell|pf1e|fireball');
  assert.equal(fbRow.source, 'aon'); assert.equal(fbRow.summary, 'Summary 0'); assert.equal(fbRow.sourceUrl, recs[0].sourceUrl);
  deepJson(fbRow.data, recs[0].data); deepJson(fbRow.spellLevels, recs[0].spellLevels);
  assert.ok(rows.get('spell|pf1e|wish').summary.startsWith('Wish is the mightiest spell'), 'empty summary derived from description');
  rows.get('spell|pf1e|magic missile').source = 'user'; rows.get('spell|pf1e|magic missile').data = { description: 'mine' };
  res = await loadFromFile(db, path);
  deepJson(res.counts, { invalid: 1, updated: 2, matched: 1 });
  assert.equal(rows.get('spell|pf1e|magic missile').data.description, 'mine', 'user entry untouched');
  assert.equal(rows.get('spell|pf1e|magic missile').matchedAon, true);
  assert.equal(rows.size, 3, 'idempotent: no new rows');
  deepJson((await loadFromFile(null, path, { dryRun: true, limit: 2 })).counts, { invalid: 1, valid: 2 });
  console.log('ok   export/load round trip');
}
console.log('AON TESTS: PASS');

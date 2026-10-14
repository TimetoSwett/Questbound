#!/usr/bin/env node
// Library tests: normalizer, zod validation, summary, permissions, presenter,
// search ordering/filters + importer upsert (against DATABASE_URL, a TEST db
// such as local qbtest), and the API routes with a mocked session.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = new URL('../', import.meta.url);
function load(path, mocks = {}) {
  const source = readFileSync(new URL(path, root), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  runInNewContext(js, { exports, console, URL, Request, Response, Date, TextDecoder, URLSearchParams, require: (n) => (n in mocks ? mocks[n] : require(n)) });
  return exports;
}
// vm-realm objects differ by prototype: compare as JSON.
const deq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
const lib = load('lib/library.ts');
const { escapeLike, normalizeNameKey, sanitizeSummary, summaryFromDescription, parseCreateInput, parsePatchInput, canEditEntry, canDeleteEntry, canCreateEntry, presentEntry, orderSearchResults, searchQuerySchema } = lib;

// normalizer + summary
assert.equal(normalizeNameKey('  Magic   Missile\t'), 'magic missile');
assert.equal(normalizeNameKey('FIREBALL'), 'fireball');
assert.equal(normalizeNameKey('Fire\u200bball\u00ad'), 'fireball');
assert.equal(escapeLike('100%_a\\b'), '100\\%\\_a\\\\b');
assert.equal(parseCreateInput({ kind: 'spell', name: 'Bad\u0007name', data: {} }).ok, false);
assert.equal(normalizeNameKey('Cure\nLight  Wounds'), 'cure light wounds');
assert.equal(sanitizeSummary('a\nb\r\n  c'), 'a b c');
const long = sanitizeSummary('x'.repeat(500));
assert.equal(long.length, 120); assert.ok(long.endsWith('…'));
assert.equal(summaryFromDescription('Deals damage. More text here.'), 'Deals damage.');
console.log('ok   normalizer & summary');

// validation
const good = { kind: 'spell', name: ' Magic  Missile ', data: { school: 'evocation', descriptors: ['force'], description: 'A missile of magical energy darts forth. It hits.' }, spellLevels: [{ cls: 'Wizard', level: 1 }, { cls: 'sorcerer', level: 1 }] };
const p = parseCreateInput(good);
assert.ok(p.ok, JSON.stringify(p));
assert.equal(p.value.nameKey, 'magic missile'); assert.equal(p.value.system, 'pf1e');
assert.equal(p.value.summary, 'A missile of magical energy darts forth.');
assert.equal(p.value.spellLevels[0].cls, 'wizard');
assert.equal(p.value.data.range, '');
for (const bad of [
  { ...good, kind: 'feat' }, { ...good, name: '   ' }, { ...good, name: 'x'.repeat(121) }, { ...good, system: 'pf2e' },
  { ...good, extra: 1 }, { ...good, data: { ...good.data, bogus: 1 } }, { ...good, data: { description: 'x'.repeat(20_001) } },
  { ...good, data: { descriptors: Array(21).fill('a') } }, { ...good, spellLevels: [{ cls: 'wizard', level: 10 }] },
  { ...good, spellLevels: [{ cls: 'wizard', level: 1 }, { cls: 'WIZARD', level: 2 }] }, { ...good, spellLevels: [{ cls: 'wizard', level: 1.5 }] },
  { ...good, sourceUrl: 'javascript:alert(1)' }, null, 'str',
]) assert.equal(parseCreateInput(bad).ok, false, JSON.stringify(bad)?.slice(0, 80));
assert.ok(parsePatchInput('spell', { summary: 'a\nb' }).ok);
assert.equal(parsePatchInput('spell', { summary: 'a\nb' }).value.summary, 'a b');
assert.equal(parsePatchInput('spell', { kind: 'spell' }).ok, false);
assert.equal(parsePatchInput('spell', { data: { school: 'x'.repeat(41) } }).ok, false);
assert.equal(parsePatchInput('spell', { name: 'New  Name' }).value.nameKey, 'new name');
const sq = searchQuerySchema.parse({ limit: '50', level: '3' });
assert.equal(sq.limit, 50); assert.equal(sq.level, 3); assert.equal(sq.kind, 'spell'); assert.equal(sq.page, 1);
assert.equal(searchQuerySchema.parse({ page: '3' }).page, 3);
assert.equal(searchQuerySchema.safeParse({ limit: '51' }).success, false);
assert.equal(searchQuerySchema.safeParse({ page: '0' }).success, false);
assert.equal(searchQuerySchema.safeParse({ page: '501' }).success, false);
assert.equal(searchQuerySchema.safeParse({ level: '10' }).success, false);
const facets = searchQuerySchema.parse({ school: ' Evocation ', subschool: 'Healing', descriptor: 'Fire', duration: ' Round ', range: 'Medium' });
assert.equal(facets.school, 'evocation'); assert.equal(facets.subschool, 'healing'); assert.equal(facets.descriptor, 'fire');
assert.equal(facets.duration, 'round'); assert.equal(facets.range, 'medium');
assert.equal(searchQuerySchema.parse({ school: '  ' }).school, undefined);
assert.equal(searchQuerySchema.safeParse({ duration: 'x'.repeat(81) }).success, false);
const filtered = lib.searchWhere(facets);
deq(filtered.base.AND, [
  { data: { path: ['school'], equals: 'evocation' } },
  { data: { path: ['subschool'], string_contains: 'healing' } },
  { data: { path: ['descriptors'], array_contains: ['fire'] } },
  { data: { path: ['duration'], string_contains: 'round' } },
  { data: { path: ['range'], string_contains: 'medium' } },
]);
assert.equal(lib.searchWhere(searchQuerySchema.parse({ q: 'fire' })).base.AND, undefined);
assert.equal(lib.searchWhere(searchQuerySchema.parse({ kind: 'rule', school: 'evocation' })).base.AND, undefined);
console.log('ok   validation');

// permissions
const alice = { id: 'alice', isAdmin: false }, bob = { id: 'bob', isAdmin: false }, admin = { id: 'root', isAdmin: true };
const userEntry = { createdById: 'alice', source: 'user' }, aonEntry = { createdById: null, source: 'aon' }, orphan = { createdById: null, source: 'user' };
assert.ok(canCreateEntry(alice)); assert.ok(!canCreateEntry(null)); assert.ok(canCreateEntry(alice, 'spell'));
assert.ok(!canCreateEntry(alice, 'rule')); assert.ok(canCreateEntry(admin, 'rule')); assert.ok(!canCreateEntry(null, 'rule'));
for (const src of ['user', 'aon']) { assert.ok(!canEditEntry(alice, { createdById: 'alice', source: src, kind: 'rule' }), 'rules admin-only for creator'); assert.ok(!canDeleteEntry(alice, { createdById: 'alice', source: src, kind: 'rule' })); assert.ok(canEditEntry(admin, { createdById: 'alice', source: src, kind: 'rule' })); }
assert.ok(lib.patchRequestsRuleKind({ kind: 'rule' })); assert.ok(lib.patchRequestsRuleKind({ kind: ' Rule ' })); assert.ok(!lib.patchRequestsRuleKind({ kind: 'spell' })); assert.ok(!lib.patchRequestsRuleKind(null));
assert.ok(canEditEntry(alice, userEntry)); assert.ok(!canEditEntry(bob, userEntry)); assert.ok(canEditEntry(admin, userEntry));
assert.ok(!canEditEntry(alice, aonEntry)); assert.ok(canEditEntry(admin, aonEntry)); assert.ok(!canDeleteEntry(alice, aonEntry));
assert.ok(!canEditEntry(alice, { createdById: 'alice', source: 'aon' }), 'aon read-only even for creator');
assert.ok(!canEditEntry(alice, orphan)); assert.ok(!canEditEntry(null, userEntry));
const pres = presentEntry({ id: 'e', kind: 'spell', name: 'N', nameKey: 'n', system: 'pf1e', source: 'user', sourceUrl: null, matchedAon: false, summary: 's', data: { a: 1 }, createdById: 'alice', createdAt: new Date(0), updatedAt: new Date(0), spellLevels: [{ cls: 'wizard', level: 3, entryId: 'e' }, { cls: 'cleric', level: 2 }] }, alice);
deq(pres.spellLevels, [{ cls: 'cleric', level: 2 }, { cls: 'wizard', level: 3 }]);
assert.equal(pres.canEdit, true); assert.equal(pres.createdAt, '1970-01-01T00:00:00.000Z'); assert.ok(!('nameKey' in pres));
console.log('ok   permissions & presenter');

// ordering (pure)
const rows = ['xfire', 'fireball', 'fire shield', 'wall of fire', 'firebrand'].map((nameKey) => ({ nameKey }));
deq(orderSearchResults(rows, 'FIRE', 10).map((r) => r.nameKey), ['fire shield', 'fireball', 'firebrand', 'wall of fire', 'xfire']);
assert.equal(orderSearchResults(rows, 'fire', 2).length, 2);
assert.equal(lib.numeralAltKey('summon monster i'), 'summon monster 1');
assert.equal(lib.numeralAltKey('summon monster ix'), 'summon monster 9');
assert.equal(lib.numeralAltKey('summon monster 10'), 'summon monster x');
assert.equal(lib.numeralAltKey('summon monster 1'), 'summon monster i');
for (const k of ['i', '1', 'invisib', 'magic missile', 'summon monster 11', 'summon monster xi', 'summon monster iv2', 'iron i x']) assert.equal(lib.numeralAltKey(k), k === 'iron i x' ? 'iron i 10' : null, k);
const nrows = ['summon monster 1', 'summon monster 2', 'greater summon monster 1'].map((nameKey) => ({ nameKey }));
deq(orderSearchResults(['ward 5', 'ward 50', 'ward v', 'ward vi'].map((nameKey) => ({ nameKey })), 'Ward V', 2).map((r) => r.nameKey), ['ward 5', 'ward v'], 'exact (both forms) before prefix');
deq(orderSearchResults(['fire shield', 'fire', 'fireball'].map((nameKey) => ({ nameKey })), 'fire', 3).map((r) => r.nameKey), ['fire', 'fire shield', 'fireball']);
deq(orderSearchResults(nrows, 'Summon Monster I', 10).map((r) => r.nameKey), ['summon monster 1', 'greater summon monster 1', 'summon monster 2']);
console.log('ok   ordering');

// rules: schema + terms (pure)
{
  const ruleBase = { kind: 'rule', name: 'Grab', data: { format: 'grab', text: 'Grabs. More.' } };
  let rp = parseCreateInput(ruleBase);
  assert.ok(rp.ok, JSON.stringify(rp));
  assert.equal(rp.value.data.category, 'universal-monster-rule'); deq(rp.value.data.aliases, []);
  assert.equal(rp.value.summary, 'Grabs.'); assert.equal((rp.value.spellLevels ?? []).length, 0);
  rp = parseCreateInput({ ...ruleBase, data: { ...ruleBase.data, aliases: ['  DR  ', 'Low-Light  Vision', 'dr'] } });
  assert.ok(rp.ok); deq(rp.value.data.aliases, ['dr', 'low-light vision'], 'aliases normalized + deduped');
  for (const bad of [
    { ...ruleBase.data, aliases: ['x'.repeat(81)] }, { ...ruleBase.data, aliases: Array.from({ length: 11 }, (_, i) => `a${i}`) },
    { ...ruleBase.data, aliases: [''] }, { ...ruleBase.data, aliases: ['a\u0007b'] }, { ...ruleBase.data, category: 'feat' }, { ...ruleBase.data, bogus: 1 },
  ]) assert.equal(parseCreateInput({ ...ruleBase, data: bad }).ok, false, JSON.stringify(bad).slice(0, 60));
  assert.ok(lib.ruleDataSchema.safeParse({ ...ruleBase.data, aliases: ['x'.repeat(80)] }).success);
  const bt = lib.buildTerms([
    { id: 'b', kind: 'rule', nameKey: 'grab', data: { aliases: ['grab', 'seize'] } },
    { id: 'a', kind: 'rule', nameKey: 'damage reduction', data: { aliases: ['dr'] } },
    { id: 'c', kind: 'spell', nameKey: 'dr', data: {} },
  ]);
  deq(bt.map((t) => t.term), ['damage reduction', 'seize', 'grab', 'dr'], 'longest first, alias rows, one row per term');
  deq(bt.slice(3).map((t) => t.entryId), ['c'], 'name match (c) beats alias (a) among non-aon');
  const mixed = lib.buildTerms([
    { id: 'u1', kind: 'rule', nameKey: 'dr', source: 'user', data: {} },
    { id: 'z9', kind: 'rule', nameKey: 'damage reduction', source: 'aon', data: { aliases: ['dr'] } },
    { id: 'a1', kind: 'rule', nameKey: 'other', source: 'user', data: { aliases: ['shared'] } },
    { id: 'a0', kind: 'spell', nameKey: 'shared', source: 'user', data: {} },
    { id: 'b1', kind: 'rule', nameKey: 'tie', source: 'user', data: {} },
    { id: 'b0', kind: 'spell', nameKey: 'tie', source: 'user', data: {} },
  ]);
  deq(mixed.filter((t) => t.term === 'dr'), [{ term: 'dr', entryId: 'z9', kind: 'rule' }], 'AoN alias beats user name');
  deq(mixed.filter((t) => t.term === 'shared'), [{ term: 'shared', entryId: 'a0', kind: 'spell' }], 'name beats alias among non-aon');
  deq(mixed.filter((t) => t.term === 'tie'), [{ term: 'tie', entryId: 'b0', kind: 'spell' }], 'then id');
  assert.equal(new Set(mixed.map((t) => t.term)).size, mixed.length, 'terms unique');
  assert.ok(lib.etagMatches('W/"x", "y"', '"y"')); assert.ok(lib.etagMatches('*', '"y"')); assert.ok(!lib.etagMatches(null, '"y"'));
  console.log('ok   rule schema & terms');
}

// term refresher: conditional GET, throttle, in-flight guard (pure, fake fetch + clock)
{
  const tc = load('lib/library-terms-client.ts');
  const row = (term) => ({ term, entryId: `id-${term}`, kind: 'rule' });
  let clock = 1_000_000;
  const calls = [];
  const replies = [];
  const fetchImpl = async (url, init) => { calls.push({ url, inm: init.headers['If-None-Match'] ?? null }); return replies.shift(); };
  const ok = (rows, etag) => new Response(JSON.stringify(rows), { status: 200, headers: { ETag: etag } });
  const mk = () => tc.createTermRefresher({ fetchImpl, now: () => clock, load: () => null, save: () => {} });
  const r = mk();
  replies.push(ok([row('grab')], '"v1"'));
  let res = await r.refresh();
  assert.equal(calls.length, 1); assert.equal(calls[0].inm, null); assert.equal(res.changed, true); deq(res.terms, [row('grab')]);
  const firstTerms = r.current();
  // forced revalidate sends If-None-Match; 304 -> unchanged, same identity
  replies.push(new Response(null, { status: 304 }));
  res = await r.refresh({ force: true });
  assert.equal(calls[1].inm, '"v1"'); assert.equal(res.changed, false); assert.equal(r.current(), firstTerms);
  // throttle: focus within 30s makes no request; after 30s it does
  clock += 10_000;
  res = await r.refresh({ throttle: true });
  assert.equal(calls.length, 2); assert.equal(res.changed, false);
  // invalidation (force) bypasses the throttle
  replies.push(new Response(null, { status: 304 }));
  await r.refresh({ force: true });
  assert.equal(calls.length, 3, 'force bypasses throttle');
  clock += 31_000;
  replies.push(ok([row('grab'), row('seize')], '"v2"'));
  res = await r.refresh({ throttle: true });
  assert.equal(calls.length, 4); assert.equal(calls[3].inm, '"v1"'); assert.equal(res.changed, true); deq(res.terms.map((t) => t.term), ['grab', 'seize']);
  // 200 with the same etag is not a change
  replies.push(ok([row('grab'), row('seize')], '"v2"'));
  assert.equal((await r.refresh({ force: true })).changed, false);
  // concurrent triggers share one request
  const n = calls.length;
  replies.push(new Response(null, { status: 304 }));
  const [a, b, c] = [r.refresh(), r.refresh({ throttle: true }), r.refresh()];
  await Promise.all([a, b, c]);
  assert.equal(calls.length, n + 1, 'concurrent share one request');
  // forced during in-flight: exactly one follow-up, shared by repeated forces
  replies.push(new Response(null, { status: 304 }), new Response(null, { status: 304 }));
  await Promise.all([r.refresh(), r.refresh({ force: true }), r.refresh({ force: true })]);
  assert.equal(calls.length, n + 3);
  // fetch failure keeps cached terms, unchanged
  replies.push(Promise.reject(new Error('offline')));
  res = await r.refresh({ force: true });
  assert.equal(res.changed, false); assert.equal(res.terms.length, 2);
  // invalidate is SSR-safe (no window)
  tc.invalidateLibraryTerms();
  console.log('ok   term refresher');
}

if (!process.env.DATABASE_URL) { console.log('skip DB tests (set DATABASE_URL to a TEST database)'); console.log('LIBRARY TESTS: PASS'); process.exit(0); }
if (/hpminioma|prod/i.test(process.env.DATABASE_URL)) { console.error('Refusing to run DB tests against a production-looking DATABASE_URL'); process.exit(1); }

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const tag = `zzlt${Date.now()}`;
const users = [];
try {
  const mkUser = async (isAdmin = false) => { const u = await prisma.user.create({ data: { email: `${tag}_${users.length}@example.com`, password: 'x', isAdmin } }); users.push(u.id); return u; };
  const uA = await mkUser(), uB = await mkUser(), uAdmin = await mkUser(true);

  // search ordering + filters (DB)
  const mk = (name, levels, extra = {}) => prisma.libraryEntry.create({ data: { kind: 'spell', system: 'pf1e', name, nameKey: normalizeNameKey(name), data: {}, createdById: uA.id, ...extra, spellLevels: { create: levels } } });
  await mk(`${tag} Fireball`, [{ cls: 'wizard', level: 3 }, { cls: 'sorcerer', level: 3 }]);
  await mk(`${tag} Fire Shield`, [{ cls: 'wizard', level: 4 }]);
  await mk(`${tag} Cure Wounds`, [{ cls: 'cleric', level: 1 }]);
  await mk(`Wall of ${tag} Fire`, [{ cls: 'wizard', level: 4 }]);
  await prisma.libraryEntry.create({ data: { kind: 'spell', system: 'dnd35', name: `${tag} Fireball`, nameKey: normalizeNameKey(`${tag} Fireball`), data: {} } });
  const s = (q) => lib.searchLibrary(prisma, searchQuerySchema.parse(q));
  let r = await s({ q: `${tag} FIRE` });
  deq(r.map((x) => x.name), [`${tag} Fire Shield`, `${tag} Fireball`, `Wall of ${tag} Fire`], 'prefix block first');
  r = await s({ q: tag });
  deq(r.map((x) => x.name), [`${tag} Cure Wounds`, `${tag} Fire Shield`, `${tag} Fireball`, `Wall of ${tag} Fire`], 'prefix first, then contains');
  assert.ok(r.every((x) => Array.isArray(x.spellLevels)));
  r = await s({ q: tag, cls: 'Wizard', level: '4' });
  deq(r.map((x) => x.name), [`${tag} Fire Shield`, `Wall of ${tag} Fire`]);
  r = await s({ q: tag, cls: 'cleric' });
  deq(r.map((x) => x.name), [`${tag} Cure Wounds`]);
  r = await s({ q: tag, system: 'dnd35' });
  assert.equal(r.length, 1);
  r = await s({ q: tag, limit: '2' });
  assert.equal(r.length, 2);
  deq((await s({ q: tag, limit: '2', page: '1' })).map((x) => x.name), [`${tag} Cure Wounds`, `${tag} Fire Shield`]);
  deq((await s({ q: tag, limit: '2', page: '2' })).map((x) => x.name), [`${tag} Fireball`, `Wall of ${tag} Fire`], 'page 2 continues the same order');
  const paged = await lib.searchLibraryPage(prisma, searchQuerySchema.parse({ q: tag, limit: '2', page: '2' }));
  assert.equal(paged.total, 4);
  assert.equal((await s({ q: tag, limit: '2', page: '9' })).length, 0);
  // roman <-> digit numeral matching against the real AoN import (read-only)
  const aon = (q) => s({ q, system: 'pf1e' });
  r = await aon('summon monster i');
  assert.equal(r[0]?.name, 'Summon Monster 1', 'roman i finds AoN digit name');
  r = await aon('summon monster 1');
  assert.equal(r[0]?.name, 'Summon Monster 1', 'digit still works');
  r = await aon('Summon  Monster IX'); assert.equal(r[0]?.name, 'Summon Monster 9');
  for (const q of ['i', 'invisib', 'magic missile']) {
    const k = normalizeNameKey(q);
    const got = (await aon(q)).map((x) => x.name);
    assert.ok(got.length > 0, q);
    assert.ok((await aon(q)).every((x) => x.nameKey.includes(k)), `${q} unaffected (plain contains only)`);
  }
  assert.equal((await aon('magic missile'))[0]?.name, 'Magic Missile');
  await mk(`${tag} Ward II`, []);
  r = await s({ q: `${tag} ward 2` }); deq(r.map((x) => x.name), [`${tag} Ward II`], 'digit finds user roman entry');
  r = await s({ q: `${tag}%` }); assert.equal(r.length, 0, 'LIKE still escaped');
  // exact-first: exact roman + digit forms beat alphabetically-earlier prefix matches, even with a small limit
  for (const n of ['Rune 50', 'Rune 5', 'Rune V', 'Rune VI', 'Greater Rune V']) await mk(`${tag} ${n}`, []);
  r = await s({ q: `${tag} rune v`, limit: '2' }); deq(r.map((x) => x.name), [`${tag} Rune 5`, `${tag} Rune V`], 'both exact forms first within limit');
  r = await s({ q: `${tag} rune v`, limit: '1' }); deq(r.map((x) => x.name), [`${tag} Rune 5`]);
  r = await s({ q: `${tag} rune v` }); deq(r.map((x) => x.name), [`${tag} Rune 5`, `${tag} Rune V`, `${tag} Rune 50`, `${tag} Rune VI`], 'exact, then prefix, no dupes');
  r = await s({ q: `rune v`, limit: '50' }); assert.equal(r.filter((x) => x.name.startsWith(tag)).length, 5, 'contains block still included');
  assert.equal(new Set(r.map((x) => x.id)).size, r.length);
  console.log('ok   DB search ordering & filters');

  // upsert matching
  const imp = { kind: 'spell', system: 'pf1e', name: `${tag} Cure  Wounds`, sourceUrl: 'https://aonprd.com/SpellDisplay.aspx?ItemName=Cure', summary: 'AON summary', data: { description: 'AON text' }, spellLevels: [{ cls: 'cleric', level: 9 }] };
  let u = await lib.upsertLibraryEntry(prisma, imp);
  assert.equal(u.action, 'matched');
  let e = await prisma.libraryEntry.findUnique({ where: { id: u.id }, include: { spellLevels: true } });
  assert.equal(e.source, 'user'); assert.equal(e.matchedAon, true); assert.equal(e.sourceUrl, imp.sourceUrl);
  assert.equal(e.name, `${tag} Cure Wounds`); deq(e.data, {}); assert.equal(e.spellLevels[0].level, 1, 'user fields untouched');
  u = await lib.upsertLibraryEntry(prisma, { ...imp, name: `${tag} Haste`, spellLevels: [{ cls: 'wizard', level: 3 }] });
  assert.equal(u.action, 'created');
  e = await prisma.libraryEntry.findUnique({ where: { id: u.id }, include: { spellLevels: true } });
  assert.equal(e.source, 'aon'); assert.equal(e.summary, 'AON summary'); assert.equal(e.spellLevels.length, 1);
  const u2 = await lib.upsertLibraryEntry(prisma, { ...imp, name: `${tag} HASTE`, summary: '', data: { description: 'New text. More.' }, spellLevels: [{ cls: 'bard', level: 3 }, { cls: 'wizard', level: 3 }] });
  deq(u2, { action: 'updated', id: u.id });
  e = await prisma.libraryEntry.findUnique({ where: { id: u.id }, include: { spellLevels: true } });
  assert.equal(e.name, `${tag} HASTE`); assert.equal(e.summary, 'New text.'); assert.equal(e.spellLevels.length, 2);
  console.log('ok   importer upsert matching');

  // routes with mocked session (real DB)
  let sessionUser = null;
  const nextMock = { NextResponse: { json: (b, init) => Response.json(b, init) } };
  const mocks = { 'next/server': nextMock, '@/auth': { auth: async () => (sessionUser ? { user: { id: sessionUser } } : null) }, '@/lib/prisma': { prisma }, '@/lib/library': lib };
  const api = load('lib/library-api.ts', mocks);
  const rmocks = { ...mocks, '@/lib/library-api': api };
  const list = load('app/api/library/route.ts', rmocks);
  const one = load('app/api/library/[id]/route.ts', rmocks);
  const J = (method, body) => new Request('http://t/api/library', { method, headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const ctx = (id) => ({ params: Promise.resolve({ id }) });

  assert.equal((await list.GET(new Request('http://t/api/library?q=x'))).status, 401);
  assert.equal((await list.POST(J('POST', good))).status, 401);
  sessionUser = uA.id;
  let res = await list.POST(J('POST', { ...good, name: `${tag} Magic Missile` }));
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.source, 'user'); assert.equal(created.createdById, uA.id); assert.equal(created.canEdit, true);
  assert.equal((await list.POST(J('POST', { ...good, name: `${tag}  MAGIC missile ` }))).status, 409);
  assert.equal((await list.POST(J('POST', { ...good, name: '' }))).status, 400);
  assert.equal((await list.POST(J('POST', '{bad'))).status, 400);
  assert.equal((await list.POST(J('POST', { ...good, data: { description: 'x'.repeat(70_000) } }))).status, 413);
  res = await list.GET(new Request(`http://t/api/library?kind=spell&q=${encodeURIComponent(tag + ' magic')}&cls=wizard&level=1`));
  const body = await res.json();
  assert.equal(body.results.length, 1); assert.ok(!('data' in body.results[0])); deq(body.results[0].spellLevels, [{ cls: 'sorcerer', level: 1 }, { cls: 'wizard', level: 1 }]);
  assert.equal((await list.GET(new Request('http://t/api/library?limit=51'))).status, 400);
  res = await one.GET(new Request('http://t'), ctx(created.id)); assert.equal(res.status, 200); assert.ok((await res.json()).data);
  assert.equal((await one.GET(new Request('http://t'), ctx('nope'))).status, 404);
  sessionUser = uB.id;
  assert.equal((await one.PATCH(J('PATCH', { summary: 'hijack' }), ctx(created.id))).status, 403);
  assert.equal((await one.DELETE(new Request('http://t'), ctx(created.id))).status, 403);
  sessionUser = uA.id;
  res = await one.PATCH(J('PATCH', { summary: 'Mine\nnow', spellLevels: [{ cls: 'magus', level: 1 }] }), ctx(created.id));
  assert.equal(res.status, 200);
  const patched = await res.json();
  assert.equal(patched.summary, 'Mine now'); deq(patched.spellLevels, [{ cls: 'magus', level: 1 }]);
  assert.equal((await one.PATCH(J('PATCH', { name: `${tag} Fireball` }), ctx(created.id))).status, 409, 'rename onto existing nameKey');
  assert.equal((await one.PATCH(J('PATCH', { kind: 'feat' }), ctx(created.id))).status, 400);
  const aonId = u.id; // created by the importer above
  assert.equal((await one.PATCH(J('PATCH', { summary: 'x' }), ctx(aonId))).status, 403, 'aon read-only for users');
  assert.equal((await one.DELETE(new Request('http://t'), ctx(aonId))).status, 403);
  sessionUser = uAdmin.id;
  res = await one.PATCH(J('PATCH', { summary: 'Admin fix' }), ctx(aonId));
  assert.equal(res.status, 200); assert.equal((await res.json()).canEdit, true);
  res = await one.GET(new Request('http://t'), ctx(created.id)); assert.equal((await res.json()).canEdit, true, 'admin can edit user entries');
  sessionUser = uA.id;
  assert.equal((await one.DELETE(new Request('http://t'), ctx(created.id))).status, 200);
  assert.equal(await prisma.spellLevel.count({ where: { entryId: created.id } }), 0, 'spell levels cascade');
  // creator deletion sets createdById null
  const orphan = await mk(`${tag} Orphan`, [], { createdById: uB.id });
  await prisma.user.delete({ where: { id: uB.id } });
  assert.equal((await prisma.libraryEntry.findUnique({ where: { id: orphan.id } })).createdById, null, 'SetNull on creator delete');
  console.log('ok   API routes (401/400/403/404/409/413, admin, cascade, SetNull)');

  // rules: create, terms, lookup
  {
    let res;
    const tj = (o) => new Request('http://t/api/library/lookup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof o === 'string' ? o : JSON.stringify(o) });
    const termsRoute = load('app/api/library/terms/route.ts', rmocks);
    const lookupRoute = load('app/api/library/lookup/route.ts', rmocks);
    const tget = (q = '', inm) => termsRoute.GET(new Request(`http://t/api/library/terms${q}`, { headers: inm ? { 'if-none-match': inm } : {} }));
    sessionUser = null;
    assert.equal((await tget('?kind=rule')).status, 401);
    assert.equal((await lookupRoute.POST(tj({ terms: ['a'] }))).status, 401);
    sessionUser = uA.id;
    // non-admin cannot create rules
    const rn = (n) => `${tag} ${n}`;
    assert.equal((await list.POST(J('POST', { kind: 'rule', name: rn('Sneaky'), data: { format: '', text: 'x' } }))).status, 403, 'non-admin POST rule');
    assert.equal(await prisma.libraryEntry.count({ where: { nameKey: rn('Sneaky').toLowerCase() } }), 0);
    sessionUser = uAdmin.id;
    const mkRule = async (name, aliases) => {
      const r = await list.POST(J('POST', { kind: 'rule', name, data: { format: 'fmt', text: `${name} text. More.`, aliases } }));
      assert.equal(r.status, 201, name);
      return r.json();
    };
    const long1 = await mkRule(rn('Longest Rule Name'), [`${tag}alp`, `${tag} aliasone`]);
    const short1 = await mkRule(rn('Zed'), [`${tag}zz`]);
    assert.equal(long1.kind, 'rule'); assert.equal(long1.source, 'user'); assert.equal(long1.createdById, uAdmin.id); deq(long1.spellLevels, []);
    deq(long1.data.aliases, [`${tag}alp`, `${tag} aliasone`]);
    assert.equal((await list.POST(J('POST', { kind: 'rule', name: rn('Bad'), data: { format: '', text: 'x', aliases: ['y'.repeat(81)] } }))).status, 400);
    res = await list.POST(J('POST', { kind: 'rule', name: rn('Ignores Levels'), data: { format: '', text: 'x' }, spellLevels: [{ cls: 'wizard', level: 1 }] }));
    assert.equal(res.status, 201); deq((await res.json()).spellLevels, [], 'rules never store spell levels');
    // non-admin cannot patch/delete/convert
    sessionUser = uA.id;
    res = await one.PATCH(J('PATCH', { summary: 'x' }), ctx(long1.id));
    assert.equal(res.status, 403, 'non-admin PATCH rule'); assert.equal((await res.json()).error, 'Only admins can edit rules');
    res = await one.DELETE(new Request('http://t'), ctx(long1.id));
    assert.equal(res.status, 403, 'non-admin DELETE rule'); assert.equal((await res.json()).error, 'Only admins can delete rules');
    const mine = await mk(rn('Mine Spell'), []);
    res = await one.PATCH(J('PATCH', { kind: 'rule' }), ctx(mine.id));
    assert.equal(res.status, 403, 'non-admin PATCH kind->rule'); assert.equal((await res.json()).error, 'Only admins can change an entry into a rule');
    assert.equal((await prisma.libraryEntry.findUnique({ where: { id: mine.id } })).kind, 'spell');
    res = await one.PATCH(J('PATCH', { kind: 'rule', data: { text: 'x' } }), ctx(mine.id));
    assert.equal(res.status, 403); assert.equal((await res.json()).error, 'Only admins can change an entry into a rule');
    assert.equal((await prisma.libraryEntry.findUnique({ where: { id: long1.id } })).summary, long1.summary, 'rule untouched');
    sessionUser = uAdmin.id;
    assert.equal((await one.PATCH(J('PATCH', { kind: 'rule' }), ctx(mine.id))).status, 400, 'kind never patchable, even for admin');
    sessionUser = uA.id;
    const spell = await mk(rn('Zed'), [{ cls: 'wizard', level: 1 }]); // same name, different kind
    await prisma.libraryEntry.update({ where: { id: spell.id }, data: { summary: 'spell zed' } });

    // terms
    res = await tget('?kind=rule');
    assert.equal(res.status, 200);
    const etag = res.headers.get('etag');
    assert.ok(etag && etag.includes('rule'));
    const terms = (await res.json()).filter((t) => t.term.includes(tag));
    deq(terms.map((t) => t.term), [rn('Longest Rule Name').toLowerCase(), `${tag} aliasone`, rn('Ignores Levels').toLowerCase(), `${tag}alp`, rn('Zed').toLowerCase(), `${tag}zz`].sort((a, b) => b.length - a.length || (a < b ? -1 : 1)), 'longest first incl. alias rows');
    assert.ok(terms.every((t) => t.kind === 'rule'));
    assert.equal(terms.find((t) => t.term === `${tag}alp`).entryId, long1.id);
    res = await tget('?kind=rule', etag); assert.equal(res.status, 304); assert.equal(res.headers.get('etag'), etag);
    res = await tget('?kind=rule', `"nope", ${etag}`); assert.equal(res.status, 304);
    res = await tget('?kind=rule', '"stale"'); assert.equal(res.status, 200);
    assert.equal((await tget('?kind=bogus')).status, 400);
    assert.ok((await (await tget()).json()).some((t) => t.kind === 'spell'), 'no kind filter -> all kinds');
    await new Promise((r) => setTimeout(r, 15));
    await prisma.libraryEntry.update({ where: { id: short1.id }, data: { data: { category: 'universal-monster-rule', format: 'fmt', text: 'changed', aliases: [`${tag}zz`, `${tag}zz2`] } } });
    res = await tget('?kind=rule', etag);
    assert.equal(res.status, 200, 'etag changed after update');
    assert.notEqual(res.headers.get('etag'), etag);
    assert.ok((await res.json()).some((t) => t.term === `${tag}zz2`));

    // lookup
    const look = async (body) => lookupRoute.POST(tj(body));
    res = await look({ terms: [`${tag}ZZ`, 'nonexistent-zzz-term', rn('Longest Rule Name'), `  ${tag}ALP `, `${tag}zz`] });
    assert.equal(res.status, 200);
    let out = await res.json();
    deq(out.map((o) => o.term), [`${tag}ZZ`, 'nonexistent-zzz-term', rn('Longest Rule Name'), `  ${tag}ALP `, `${tag}zz`], 'input order + original term echoed');
    assert.equal(out[0].match.id, short1.id, 'alias match, normalized'); assert.equal(out[0].match.kind, 'rule');
    assert.equal(out[1].match, null);
    assert.equal(out[2].match.id, long1.id); assert.equal(out[2].match.name, rn('Longest Rule Name'));
    assert.equal(out[3].match.id, long1.id);
    deq(out[4], { ...out[0], term: `${tag}zz` }, 'duplicate terms resolve identically');
    assert.deepEqual(Object.keys(out[2].match).sort(), ['id', 'kind', 'name', 'sourceUrl', 'summary']);
    out = await (await look({ terms: [rn('Zed')] })).json();
    assert.equal(out[0].match.kind, 'rule', 'rule beats spell on tie');
    out = await (await look({ terms: [rn('Zed')], kind: 'spell' })).json();
    assert.equal(out[0].match.id, spell.id); assert.equal(out[0].match.summary, 'spell zed');
    out = await (await look({ terms: [`${tag}zz`], kind: 'spell' })).json();
    assert.equal(out[0].match, null, 'kind filter excludes rule alias');
    out = await (await look({ terms: [rn('Zed')], system: 'dnd35' })).json();
    assert.equal(out[0].match, null, 'system filter');
    deq(await (await look({ terms: [] })).json(), []);
    assert.equal((await look({ terms: Array.from({ length: 50 }, (_, i) => `t${i}`) })).status, 200);
    assert.equal((await look({ terms: Array.from({ length: 51 }, (_, i) => `t${i}`) })).status, 400, '>50 terms');
    assert.equal((await look({ terms: ['x'.repeat(81)] })).status, 400, 'term >80 chars');
    assert.equal((await look({ terms: ['x'.repeat(80)] })).status, 200);
    assert.equal((await look({ terms: 'grab' })).status, 400, 'non-array');
    assert.equal((await look({})).status, 400);
    assert.equal((await look({ terms: [1] })).status, 400);
    assert.equal((await look('{bad')).status, 400);
    console.log('ok   rules: create (admin-only), terms (ETag/304), lookup');

    // DR hijack: a non-AoN 'DR' rule must not beat AoN Damage Reduction, and terms stay one row per term
    const aonDr = await prisma.libraryEntry.findFirst({ where: { kind: 'rule', system: 'pf1e', source: 'aon', nameKey: 'damage reduction' } });
    if (aonDr) {
      const hijack = await prisma.libraryEntry.findUnique({ where: { kind_system_nameKey: { kind: 'rule', system: 'pf1e', nameKey: 'dr' } } });
      let mine2 = null;
      try {
        if (!hijack) mine2 = await prisma.libraryEntry.create({ data: { kind: 'rule', system: 'pf1e', name: 'DR', nameKey: 'dr', source: 'user', createdById: uAdmin.id, summary: `${tag} hijack`, data: { category: 'universal-monster-rule', format: '', text: 'x', aliases: [] } } });
        out = await (await look({ terms: ['DR', ' dr '] })).json();
        for (const o of out) { assert.equal(o.match.id, aonDr.id, 'DR resolves to AoN Damage Reduction'); assert.equal(o.match.name, aonDr.name); }
        const dr = (await (await tget('?kind=rule')).json()).filter((t) => t.term === 'dr');
        assert.equal(dr.length, 1, 'one terms row for dr');
        assert.equal(dr[0].entryId, aonDr.id);
        // always-tracked variant: a user rule aliasing an AoN name loses too
        const al = await prisma.libraryEntry.create({ data: { kind: 'rule', system: 'pf1e', name: rn('DR Alias'), nameKey: `${tag} dr alias`.toLowerCase(), source: 'user', createdById: uAdmin.id, summary: 's', data: { category: 'universal-monster-rule', format: '', text: 'x', aliases: ['damage reduction'] } } });
        out = await (await look({ terms: ['Damage Reduction'] })).json();
        assert.equal(out[0].match.id, aonDr.id, 'user alias does not beat AoN name');
        assert.equal((await (await tget('?kind=rule')).json()).filter((t) => t.term === 'damage reduction').length, 1);
        await prisma.libraryEntry.delete({ where: { id: al.id } });
      } finally {
        if (mine2) await prisma.libraryEntry.delete({ where: { id: mine2.id } }).catch(() => {});
      }
      console.log('ok   DR hijack guard (lookup + terms)');
    } else console.log('skip DR hijack guard (no AoN Damage Reduction in DB)');
  }
} finally {
  await prisma.libraryEntry.deleteMany({ where: { OR: [{ nameKey: { contains: tag.toLowerCase() } }] } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `${tag}_` } } });
  await prisma.$disconnect();
}
console.log('LIBRARY TESTS: PASS');

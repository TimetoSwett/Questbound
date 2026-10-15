#!/usr/bin/env node
// Companion sheet tests (against DATABASE_URL, a TEST db such as local qbtest):
// pure helpers, then the routes with a mocked session on real rows. Everything
// created is tag-prefixed and removed in `finally`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = new URL('../', import.meta.url);

let sessionUser = null;
const nextMock = { NextResponse: { json: (b, init) => Response.json(b, init) } };
const cache = new Map();
function load(path, mocks) {
  if (cache.has(path)) return cache.get(path);
  const source = readFileSync(new URL(path, root), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  cache.set(path, exports);
  const req = (n) => {
    if (n in mocks) return mocks[n];
    if (n.startsWith('@/')) return load(`${n.slice(2)}.ts`, mocks);
    if (n.startsWith('./')) return load(`${path.slice(0, path.lastIndexOf('/') + 1)}${n.slice(2)}.ts`, mocks);
    return require(n);
  };
  runInNewContext(js, { exports, console, URL, Request, Response, Date, TextDecoder, URLSearchParams, Buffer, require: req });
  return exports;
}
const deq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);

// ---- pure helpers -------------------------------------------------------
const pure = load('lib/companions.ts', {});
assert.ok(pure.canAccessCharacter({ userId: 'u', campaignId: null }, 'u', null));
assert.ok(pure.canAccessCharacter({ userId: 'u', campaignId: 'c' }, 'dm1', 'dm'));
assert.ok(!pure.canAccessCharacter({ userId: 'u', campaignId: 'c' }, 'p', 'player'));
assert.ok(!pure.canAccessCharacter({ userId: 'u', campaignId: 'c' }, 'p', null));
assert.ok(!pure.canAccessCharacter({ userId: 'u', campaignId: null }, 'p', 'dm'), 'role in no campaign never counts');
assert.equal(pure.linkCompanionSchema.safeParse({ characterId: 'a' }).success, false);
assert.equal(pure.linkCompanionSchema.safeParse({ characterId: 'a', ownerId: null }).success, true);
assert.equal(pure.linkCompanionSchema.safeParse({ characterId: 'a', ownerId: 'b', extra: 1 }).success, false);
assert.equal(pure.createCompanionSchema.safeParse({ ownerId: 'a', name: '  ' }).success, false);
assert.equal(pure.createCompanionSchema.safeParse({ ownerId: 'a', name: 'Rex', companionType: 'x'.repeat(61) }).success, false);
assert.equal(pure.createCompanionSchema.parse({ ownerId: 'a', name: ' Rex ' }).companionType, '');
const grouped = pure.groupCompanions([
  { id: 'c1', ownerCharacterId: 'o1', companionType: 'familiar' }, { id: 'o1' }, { id: 'lone', ownerCharacterId: 'hidden' }, { id: 'o2' },
]);
deq(grouped.map((g) => [g.item.id, g.depth, g.isCompanion]), [['o1', 0, false], ['c1', 1, true], ['lone', 0, true], ['o2', 0, false]]);
const loop = pure.groupCompanions([{ id: 'a', ownerCharacterId: 'b' }, { id: 'b', ownerCharacterId: 'a' }, { id: 's', ownerCharacterId: 's' }]);
assert.equal(loop.length, 1, 'bad data is not nested recursively; only the self-owned row is listed as a root');
const nested = pure.groupCompanions([{ id: 'o' }, { id: 'c', ownerCharacterId: 'o' }, { id: 'g', ownerCharacterId: 'c' }]);
deq(nested.map((g) => [g.item.id, g.depth]), [['o', 0], ['c', 1]], 'no grandchild nesting');
console.log('ok   pure helpers');

if (!process.env.DATABASE_URL) { console.log('skip DB tests (set DATABASE_URL to a TEST database)'); console.log('COMPANION TESTS: PASS'); process.exit(0); }
if (/hpminioma|prod/i.test(process.env.DATABASE_URL)) { console.error('Refusing to run DB tests against a production-looking DATABASE_URL'); process.exit(1); }

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const tag = `zzcmp${Date.now()}`;
const mocks = { 'next/server': nextMock, '@/auth': { auth: async () => (sessionUser ? { user: { id: sessionUser } } : null) }, '@/lib/prisma': { prisma } };
const comp = load('app/api/characters/companions/route.ts', mocks);
const chars = load('app/api/characters/route.ts', mocks);
const single = load('app/api/characters/single/route.ts', mocks);
const lib = load('lib/companions.ts', mocks);

const call = async (user, fn, url, body) => {
  sessionUser = user?.id ?? null;
  const res = await fn(new Request(`http://t${url}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  const text = await res.text();
  return { status: res.status, text, json: text ? JSON.parse(text) : null };
};
const listFor = (u, ch) => call(u, comp.GET, `/api/characters/companions?characterId=${ch.id}`);
const ids = (rows) => rows.map((r) => r.id).sort();

const userIds = [], campaignIds = [];
try {
  const mkUser = async (n) => { const u = await prisma.user.create({ data: { email: `${tag}_${n}@example.com`, password: 'x', displayName: `${tag}-${n}` } }); userIds.push(u.id); return u; };
  const [dm, p1, p2, outsider, dm2] = await Promise.all(['dm', 'p1', 'p2', 'out', 'dm2'].map(mkUser));
  const mkCamp = async (name, dmUser, players) => {
    const c = await prisma.campaign.create({ data: { name: `${tag} ${name}`, inviteCode: `${tag}${name}`.slice(-12).toUpperCase(), dmUserId: dmUser.id } });
    campaignIds.push(c.id);
    await prisma.campaignMembership.create({ data: { userId: dmUser.id, campaignId: c.id, role: 'dm' } });
    for (const p of players) await prisma.campaignMembership.create({ data: { userId: p.id, campaignId: c.id, role: 'player' } });
    return c;
  };
  const camp1 = await mkCamp('c1', dm, [p1, p2]);
  const camp2 = await mkCamp('c2', dm2, [p1]);
  const mk = (name, user, campaign, extra = {}) => prisma.character.create({ data: { name: `${tag} ${name}`, userId: user.id, campaignId: campaign?.id ?? null, ...extra } });

  const A = await mk('A', p1, camp1), B = await mk('B', p2, camp1);
  const compA = await mk('compA', p1, camp1, { ownerCharacterId: A.id, companionType: 'familiar' });
  const compB = await mk('compB', p2, camp1, { ownerCharacterId: B.id, companionType: 'eidolon' });
  const X = await mk('X', p1, camp1, { ownerCharacterId: B.id, companionType: 'animal companion' }); // p1's sheet under p2's owner
  const dmComp = await mk('dmComp', dm, camp1, { ownerCharacterId: A.id, companionType: 'mount' }); // DM-owned, p1 can't see it
  const vaultOwner = await mk('vaultOwner', p1, null), vaultComp = await mk('vaultComp', p1, null, { ownerCharacterId: vaultOwner.id });

  // owner sees own companions; others get nothing and no leaks
  let r = await listFor(p1, A);
  deq(ids(r.json.companions), ids([compA]), 'p1 sees only the companion they own');
  assert.equal(r.json.owner, null);
  assert.ok(!r.text.includes(dmComp.id) && !r.text.includes(`${tag} dmComp`), 'DM-owned companion hidden from p1');
  assert.deepEqual(Object.keys(r.json.companions[0]).sort(), ['companionType', 'id', 'name', 'portraitIsPublic', 'portraitPath']);
  r = await listFor(p2, A);
  deq(r.json, { owner: null, companions: [], siblings: [] }); for (const s of [A.id, compA.id, `${tag} A`, `${tag} compA`]) assert.ok(!r.text.includes(s));
  r = await listFor(outsider, A); deq(r.json, { owner: null, companions: [], siblings: [] });
  r = await listFor(outsider, B); deq(r.json, { owner: null, companions: [], siblings: [] });
  r = await call(null, comp.GET, `/api/characters/companions?characterId=${A.id}`); assert.equal(r.status, 401);
  r = await call(p1, comp.GET, '/api/characters/companions'); assert.equal(r.status, 400);
  r = await call(p1, comp.GET, '/api/characters/companions?characterId=nope'); deq(r.json, { owner: null, companions: [], siblings: [] });

  // owner summary only when the owner is visible
  r = await listFor(p1, compA);
  assert.equal(r.json.owner.id, A.id); deq(ids(r.json.siblings), ids([compA]));
  r = await listFor(p1, X);
  assert.equal(r.json.owner, null, 'p1 cannot see B, so no owner summary');
  assert.ok(!r.text.includes(B.id) && !r.text.includes(`${tag} B"`) && !r.text.includes(`${tag} compB`), 'no hidden owner id/name');
  r = await listFor(dm, X); assert.equal(r.json.owner.id, B.id, 'DM sees the owner');
  deq(ids(r.json.siblings), ids([compB, X]), 'DM sees all siblings');
  r = await listFor(p2, compB); assert.equal(r.json.owner.id, B.id);
  deq(ids(r.json.siblings), ids([compB]), 'p2 does not see p1-owned X');

  // visibility matches the existing list endpoints / single rule
  const allCamp1 = await prisma.character.findMany({ where: { campaignId: camp1.id } });
  for (const [label, u] of [['dm', dm], ['p1', p1], ['p2', p2], ['outsider', outsider]]) {
    const existing = await call(u, chars.GET, `/api/characters?campaignId=${camp1.id}`);
    const member = existing.status === 200;
    const viaHelper = ids(await lib.accessibleCharacters(prisma, u.id, allCamp1));
    if (member) deq(ids(existing.json), viaHelper, `${label}: helper == campaign list`);
    else assert.equal(existing.status, 403);
    for (const o of allCamp1) {
      const got = (await listFor(u, o)).json;
      const expected = member ? ids(existing.json.filter((c) => c.ownerCharacterId === o.id || (allCamp1.find((a) => a.id === c.id).ownerCharacterId === o.id))) : [];
      const canSeeOwner = viaHelper.includes(o.id);
      deq(ids(got.companions), canSeeOwner ? expected : [], `${label}: companions of ${o.name}`);
      // single endpoint agrees with the helper for every sheet
      const s = await call(u, single.GET, `/api/characters/single?id=${o.id}`);
      assert.equal(s.status === 200, viaHelper.includes(o.id), `${label}: single access for ${o.name}`);
    }
  }
  // vault list == helper over the caller's own sheets; ownerCharacterId redacted unless the owner is listed
  const v = await call(p1, chars.GET, '/api/characters');
  const vc = v.json.find((c) => c.id === vaultComp.id); assert.equal(vc.ownerCharacterId, vaultOwner.id);
  // list redaction: p1 sees X but not B, so X.ownerCharacterId must be null in every endpoint
  const camp = await call(p1, chars.GET, `/api/characters?campaignId=${camp1.id}`);
  assert.equal(camp.json.find((c) => c.id === X.id).ownerCharacterId, null);
  assert.equal(camp.json.find((c) => c.id === compA.id).ownerCharacterId, A.id);
  assert.ok(!(await call(p1, single.GET, `/api/characters/single?id=${X.id}`)).text.includes(B.id));
  assert.equal((await call(dm, single.GET, `/api/characters/single?id=${X.id}`)).json.ownerCharacterId, B.id);
  console.log('ok   visibility & owner summary');

  // create: requires edit on owner
  const created = [];
  r = await call(p2, comp.POST, '/api/characters/companions', { ownerId: A.id, name: 'Nope' }); assert.equal(r.status, 403);
  r = await call(outsider, comp.POST, '/api/characters/companions', { ownerId: A.id, name: 'Nope' }); assert.equal(r.status, 403);
  r = await call(null, comp.POST, '/api/characters/companions', { ownerId: A.id, name: 'Nope' }); assert.equal(r.status, 401);
  r = await call(p1, comp.POST, '/api/characters/companions', { ownerId: 'missing', name: 'Nope' }); assert.equal(r.status, 404);
  r = await call(p1, comp.POST, '/api/characters/companions', { ownerId: A.id, name: '' }); assert.equal(r.status, 400);
  r = await call(p1, comp.POST, '/api/characters/companions', { ownerId: A.id, name: 'x', userId: p2.id }); assert.equal(r.status, 400, 'strict schema');
  assert.equal(await prisma.character.count({ where: { name: 'Nope' } }), 0);
  r = await call(p1, comp.POST, '/api/characters/companions', { ownerId: A.id, name: `${tag} Rex`, companionType: 'animal companion' });
  assert.equal(r.status, 200); created.push(r.json.id);
  assert.equal(r.json.userId, p1.id); assert.equal(r.json.campaignId, camp1.id); assert.equal(r.json.ownerCharacterId, A.id); assert.equal(r.json.companionType, 'animal companion');
  r = await call(dm, comp.POST, '/api/characters/companions', { ownerId: A.id, name: `${tag} DMmade` });
  assert.equal(r.status, 200); assert.equal(r.json.userId, p1.id, 'DM-created companion belongs to the owner character\'s user'); created.push(r.json.id);
  const dmMade = r.json;
  r = await listFor(p1, A); assert.ok(ids(r.json.companions).includes(dmMade.id), 'player sees DM-created companion in list');
  r = await call(p1, single.GET, `/api/characters/single?id=${dmMade.id}`); assert.equal(r.status, 200, 'player opens DM-created companion');
  r = await listFor(dm, A); assert.ok(ids(r.json.companions).includes(dmMade.id), 'DM still sees it');
  r = await call(dm, single.GET, `/api/characters/single?id=${dmMade.id}`); assert.equal(r.status, 200);
  r = await listFor(outsider, A); deq(r.json, { owner: null, companions: [], siblings: [] }, 'outsider sees nothing');
  r = await call(outsider, single.GET, `/api/characters/single?id=${dmMade.id}`); assert.notEqual(r.status, 200, 'outsider cannot open it');
  assert.ok(!r.text.includes(`${tag} DMmade`));
  r = await call(p1, comp.POST, '/api/characters/companions', { ownerId: vaultOwner.id, name: `${tag} VaultPet` });
  assert.equal(r.status, 200); assert.equal(r.json.campaignId, null); created.push(r.json.id);
  console.log('ok   create');

  // link / unlink
  const put = (u, body) => call(u, comp.PUT, '/api/characters/companions', body);
  const L = await mk('L', p1, camp1), M = await mk('M', p2, camp1), N = await mk('N', p1, camp2), V = await mk('V', p1, null), OW = await mk('OW', p1, camp1, { ownerCharacterId: A.id });
  r = await put(p1, { characterId: L.id, ownerId: A.id, companionType: 'familiar' });
  assert.equal(r.status, 200); assert.equal(r.json.ownerCharacterId, A.id); assert.equal(r.json.companionType, 'familiar');
  r = await put(p1, { characterId: M.id, ownerId: A.id }); assert.equal(r.status, 403, 'cannot edit the companion');
  const L2 = await mk('L2', p1, camp1);
  r = await put(p1, { characterId: L2.id, ownerId: B.id }); assert.equal(r.status, 403, 'cannot edit the owner');
  r = await put(p2, { characterId: B.id, ownerId: A.id }); assert.equal(r.status, 403, 'edits companion but not owner');
  assert.equal((await prisma.character.findUnique({ where: { id: L2.id } })).ownerCharacterId, null);
  r = await put(p1, { characterId: A.id, ownerId: A.id }); assert.equal(r.status, 400, 'self-link');
  r = await put(p1, { characterId: A.id, ownerId: compA.id }); assert.equal(r.status, 400, 'direct cycle');
  // one level only
  r = await put(p1, { characterId: L2.id, ownerId: compA.id }); assert.equal(r.status, 400, 'link under a companion'); assert.match(r.json.error, /cannot have companions/);
  r = await put(dm, { characterId: L2.id, ownerId: compA.id }); assert.equal(r.status, 400, 'link under a companion, DM too');
  r = await put(p1, { characterId: A.id, ownerId: L2.id }); assert.equal(r.status, 400, 'link a character that has companions'); assert.match(r.json.error, /has companions/);
  r = await put(dm, { characterId: A.id, ownerId: L2.id }); assert.equal(r.status, 400, 'same for DM');
  assert.equal((await prisma.character.findUnique({ where: { id: A.id } })).ownerCharacterId, null);
  assert.equal((await prisma.character.findUnique({ where: { id: L2.id } })).ownerCharacterId, null);
  r = await call(p1, comp.POST, '/api/characters/companions', { ownerId: compA.id, name: 'Nested' }); assert.equal(r.status, 400, 'create under a companion');
  assert.match(r.json.error, /cannot have companions/); assert.equal(await prisma.character.count({ where: { name: 'Nested' } }), 0);
  r = await call(dm, comp.POST, '/api/characters/companions', { ownerId: compA.id, name: 'Nested' }); assert.equal(r.status, 400, 'create under a companion, DM too');
  r = await listFor(p1, compA); assert.equal(r.json.isCompanion, true); r = await listFor(p1, A); assert.equal(r.json.isCompanion, false);
  r = await put(p1, { characterId: N.id, ownerId: A.id }); assert.equal(r.status, 400, 'cross-campaign'); assert.match(r.json.error, /same campaign/);
  r = await put(p1, { characterId: V.id, ownerId: A.id }); assert.equal(r.status, 400, 'vault sheet into campaign owner');
  r = await put(p1, { characterId: compA.id, ownerId: L2.id }); assert.equal(r.status, 409, 'already a companion elsewhere');
  r = await put(dm, { characterId: M.id, ownerId: A.id }); assert.equal(r.status, 200, 'DM can edit both');
  r = await put(p1, { characterId: 'missing', ownerId: A.id }); assert.equal(r.status, 404);
  r = await put(p1, { characterId: L2.id, ownerId: 'missing' }); assert.equal(r.status, 404);
  r = await put(p1, { characterId: L2.id }); assert.equal(r.status, 400);
  r = await put(p1, { characterId: L2.id, ownerId: A.id, ownerCharacterId: 'x' }); assert.equal(r.status, 400);
  // unlink
  r = await put(p2, { characterId: compA.id, ownerId: null }); assert.equal(r.status, 403);
  assert.equal((await prisma.character.findUnique({ where: { id: compA.id } })).ownerCharacterId, A.id);
  r = await put(p1, { characterId: compA.id, ownerId: null }); assert.equal(r.status, 200); assert.equal(r.json.ownerCharacterId, null);
  r = await put(p1, { characterId: dmComp.id, ownerId: null }); assert.equal(r.status, 200, 'owner editor can unlink a companion they cannot edit');
  assert.equal((await prisma.character.findUnique({ where: { id: dmComp.id } })).ownerCharacterId, null);
  r = await put(outsider, { characterId: L.id, ownerId: null }); assert.equal(r.status, 403);
  r = await put(p1, { characterId: L.id, companionType: 'mount' }); assert.equal(r.json.companionType, 'mount');
  r = await put(p2, { characterId: L.id, companionType: 'hack' }); assert.equal(r.status, 403);
  console.log('ok   link / unlink / one-level / cross-campaign');

  // concurrent opposite links must never form a loop (row locks + in-tx re-check)
  for (let i = 0; i < 5; i++) {
    const [X, Y] = await Promise.all(['x', 'y'].map((n) => prisma.character.create({ data: { name: `${tag} race${i}${n}`, userId: p1.id, campaignId: camp1.id } })));
    const results = await Promise.all([put(p1, { characterId: X.id, ownerId: Y.id }), put(p1, { characterId: Y.id, ownerId: X.id })]);
    const statuses = results.map((res) => res.status);
    assert.ok(statuses.filter((s) => s === 200).length <= 1, `at most one link wins (got ${statuses})`);
    assert.ok(statuses.every((s) => s === 200 || s === 400), `loser is rejected cleanly (got ${statuses})`);
    const [x, y] = await Promise.all([X, Y].map((c) => prisma.character.findUnique({ where: { id: c.id } })));
    assert.ok(!(x.ownerCharacterId === Y.id && y.ownerCharacterId === X.id), 'no loop');
    assert.ok(!(x.ownerCharacterId && y.ownerCharacterId), 'one-level rule holds');
  }
  console.log('ok   concurrent link race');

  // generic update cannot touch the link
  const gput = (u, body) => { sessionUser = u.id; return chars.PUT(new Request('http://t/api/characters', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })); };
  let gr = await gput(p1, { id: L.id, name: `${tag} Renamed`, ownerCharacterId: B.id, companionType: 'hacked', owner: { connect: { id: B.id } } });
  assert.equal(gr.status, 200);
  let row = await prisma.character.findUnique({ where: { id: L.id } });
  assert.equal(row.name, `${tag} Renamed`); assert.equal(row.ownerCharacterId, A.id, 'owner untouched'); assert.equal(row.companionType, 'mount');
  gr = await gput(p1, { id: L.id, ownerCharacterId: null }); row = await prisma.character.findUnique({ where: { id: L.id } });
  assert.equal(row.ownerCharacterId, A.id, 'generic update cannot unlink');
  gr = await gput(p1, { id: V.id, campaignId: camp1.id }); assert.equal(gr.status, 200, 'unlinked vault sheet can still be assigned');
  gr = await gput(p1, { id: vaultComp.id, campaignId: camp1.id }); assert.equal(gr.status, 400, 'linked vault sheet cannot change campaign');
  gr = await gput(p1, { id: vaultOwner.id, campaignId: camp1.id }); assert.equal(gr.status, 400, 'owner with companions cannot change campaign');
  console.log('ok   generic update guard');

  // deleting an owner keeps its companions
  const dr = async (u, id) => { sessionUser = u.id; return chars.DELETE(new Request(`http://t/api/characters?id=${id}`, { method: 'DELETE' })); };
  assert.equal((await dr(p1, A.id)).status, 200);
  assert.equal(await prisma.character.findUnique({ where: { id: A.id } }), null);
  for (const id of [L.id, M.id, OW.id, created[0]]) {
    const c = await prisma.character.findUnique({ where: { id } });
    assert.ok(c, 'companion survives'); assert.equal(c.ownerCharacterId, null);
  }
  r = await listFor(p1, L); assert.equal(r.json.owner, null);
  console.log('ok   owner delete');
} finally {
  await prisma.character.deleteMany({ where: { OR: [{ name: { startsWith: tag } }, { userId: { in: userIds } }] } });
  await prisma.campaign.deleteMany({ where: { id: { in: campaignIds } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: `${tag}_` } } });
  await prisma.$disconnect();
}
console.log('COMPANION TESTS: PASS');

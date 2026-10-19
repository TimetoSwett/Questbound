// Per-player Bestiary unlocks, end to end through the real route handlers with
// an in-memory Prisma stand-in: every creature response is filtered for the
// player asking (never another player's unlocks), the GM sees everything and
// manages unlocks per player, and live updates only reach the affected player.
// Run: npm run test:creature-reveals
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
  const mod = { exports: {} };
  runInNewContext(js, { module: mod, exports: mod.exports, console, URL, Request, Response, Date, globalThis: {}, require: (n) => (n in mocks ? mocks[n] : require(n)) });
  return mod.exports;
}
const ok = (label) => console.log(`ok   ${label}`);
// Values built inside the vm sandbox have their own Array prototype: compare as JSON.
const same = (actual, expected, msg) => assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg);

// ---- fixtures: one campaign, a GM and two players; an outsider in another campaign ----
const dragon = {
  id: 'c1', campaignId: 'camp', name: 'Ancient Red Dragon', type: 'Dragon', subtype: 'Fire', size: 'Huge', cr: '15', alignment: 'CE',
  isNpc: false, portraitPath: null, acTotal: 28, acTouch: 12, acFlatFooted: 26, hpMax: 212, hpCurrent: 190, hitDice: '17d12+102',
  fort: 18, ref: 14, will: 17, str: 35, dex: 14, con: 27, int: 18, wis: 19, cha: 20, speed: 40,
  attacks: [{ name: 'Bite', bonus: '+28', damage: '2d8+18' }], skills: [], feats: [], specialAbilities: [], gear: [],
  spells: { slots: {}, known: [] }, wikiPageId: null, gmNotes: 'SECRET GM ONLY', playerNotes: 'Afraid of cold iron',
  // Legacy party-wide data that must be ignored now:
  revealLevel: 'unknown', unlockedSections: ['defense', 'offense', 'name'], lootList: [], lootTableId: null,
};
const lurker = { ...dragon, id: 'c2', name: 'Hidden Lurker', revealLevel: 'hidden', unlockedSections: [] };
const db = {
  creatures: [dragon, lurker],
  memberships: [
    { userId: 'gm', campaignId: 'camp', role: 'dm', joinedAt: 1, user: { displayName: 'Game Master' } },
    { userId: 'alice', campaignId: 'camp', role: 'player', joinedAt: 2, user: { displayName: 'Alice' } },
    { userId: 'bob', campaignId: 'camp', role: 'player', joinedAt: 3, user: { displayName: 'Bob' } },
    { userId: 'eve', campaignId: 'other', role: 'player', joinedAt: 4, user: { displayName: 'Eve' } },
  ],
  reveals: [
    { creatureId: 'c1', userId: 'alice', sections: ['defense'], full: false },
    { creatureId: 'c1', userId: 'bob', sections: ['name', 'offense'], full: false },
    { creatureId: 'c2', userId: 'alice', sections: [], full: true },
  ],
};
const revealQueries = [];
const matches = (row, where = {}) => Object.entries(where).every(([k, cond]) => {
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    if ('in' in cond) return cond.in.includes(row[k]);
    if ('not' in cond) return row[k] !== cond.not;
    if ('equals' in cond) return JSON.stringify(row[k]) === JSON.stringify(cond.equals);
  }
  return row[k] === cond;
});
const prisma = {
  creature: {
    findUnique: async ({ where }) => db.creatures.find((c) => c.id === where.id) ?? null,
    findMany: async ({ where }) => db.creatures.filter((c) => matches(c, where)),
  },
  creatureReveal: {
    findMany: async ({ where }) => { revealQueries.push(where); return db.reveals.filter((r) => matches(r, where)).map((r) => ({ ...r })); },
    upsert: async ({ where, create, update }) => {
      const { creatureId, userId } = where.creatureId_userId;
      const row = db.reveals.find((r) => r.creatureId === creatureId && r.userId === userId);
      if (row) Object.assign(row, update); else db.reveals.push({ ...create });
    },
    deleteMany: async ({ where }) => { db.reveals = db.reveals.filter((r) => !matches(r, where)); },
  },
  campaignMembership: {
    findMany: async ({ where }) => db.memberships.filter((m) => matches(m, where)).sort((a, b) => a.joinedAt - b.joinedAt),
    count: async ({ where }) => db.memberships.filter((m) => matches(m, where)).length,
  },
  $queryRaw: async () => [],
  $transaction: async (fn) => fn(prisma),
};
let me = 'alice';
const roleOf = (userId, campaignId) => db.memberships.find((m) => m.userId === userId && m.campaignId === campaignId)?.role ?? null;
const published = [];
const mocks = {
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  '@/auth': { auth: async () => (me ? { user: { id: me } } : null) },
  '@/lib/prisma': { prisma },
  '@/lib/campaign-helpers': { getUserRole: async (u, c) => roleOf(u, c) },
  '@/lib/s3': { getFileUrl: async (p) => `/api/files/${p}` },
};
const realtime = load('lib/realtime.ts');
mocks['@/lib/realtime'] = { ...realtime, publish: (campaignId, topic, opts = {}) => { published.push({ campaignId, topic, ...opts }); realtime.publish(campaignId, topic, opts); } };
mocks['@/lib/creatures'] = load('lib/creatures.ts', mocks);
mocks['@/lib/creature-reveals'] = load('lib/creature-reveals.ts', mocks);
const creaturesRoute = load('app/api/creatures/route.ts', mocks);
const revealsRoute = load('app/api/creatures/[id]/reveals/route.ts', mocks);
const battle = load('lib/battle-map.ts', mocks);

const as = async (user, fn) => { me = user; return fn(); };
const getOne = (user, id) => as(user, () => creaturesRoute.GET(new Request(`https://t/api/creatures?id=${id}`)));
const getList = (user) => as(user, () => creaturesRoute.GET(new Request('https://t/api/creatures?campaignId=camp')));
const text = async (res) => JSON.stringify(await res.clone().json());

// ---- 1. GET ?id= is filtered for the player asking ----
{
  revealQueries.length = 0;
  const a = await (await getOne('alice', 'c1')).json();
  assert.ok(revealQueries.every((w) => w.userId === 'alice'), 'only alice\'s unlocks are loaded for alice');
  assert.equal(a.defense.acTotal, 28);
  assert.equal(a.defense.hitDice, '17d12+102');
  assert.notEqual(a.offense.attacks[0].damage, '2d8+18', 'alice did not unlock offense (bob did)');
  assert.notEqual(a.name, 'Ancient Red Dragon', 'alice did not unlock the name (bob did)');
  same(a.unlockedSections, ['defense']);
  const aText = JSON.stringify(a);
  for (const secret of ['Ancient Red Dragon', '2d8+18', 'SECRET GM ONLY', 'Afraid of cold iron']) assert.ok(!aText.includes(secret), `alice payload leaks ${secret}`);

  const b = await (await getOne('bob', 'c1')).json();
  assert.equal(b.name, 'Ancient Red Dragon');
  assert.equal(b.offense.attacks[0].damage, '2d8+18');
  assert.notEqual(b.defense.acTotal, 28, 'bob did not unlock defense (alice did)');
  assert.ok(!JSON.stringify(b).includes('17d12+102'));
  assert.equal(b.revealLevel, 'named');
  ok('single creature: each player gets only their own unlocks');
}

// ---- 2. legacy party-wide unlocks don't apply; hidden stays hidden; outsiders get nothing ----
{
  db.memberships.push({ userId: 'newbie', campaignId: 'camp', role: 'player', joinedAt: 5, user: { displayName: 'Newbie' } });
  const n = await (await getOne('newbie', 'c1')).json();
  assert.equal(n.revealLevel, 'unknown');
  assert.ok(!(await text(await getOne('newbie', 'c1'))).includes('Ancient Red Dragon'), 'creature.unlockedSections is ignored');
  assert.equal(n.defense.acTotal, 'ᚱᚢ');
  db.memberships.pop();
  assert.equal((await getOne('alice', 'c2')).status, 404, 'hidden creature is 404 even with full unlocks');
  assert.equal((await getOne('eve', 'c1')).status, 403, 'non-member');
  assert.equal((await getOne(null, 'c1')).status, 401);
  ok('legacy party-wide data ignored, hidden 404, outsiders refused');
}

// ---- 3. list is filtered per player; GM gets everything ----
{
  const a = await (await getList('alice')).json();
  same(a.map((c) => c.id), ['c1'], 'hidden creature not listed');
  assert.equal(a[0].defense.acTotal, 28);
  assert.ok(!JSON.stringify(a).includes('Ancient Red Dragon'));
  const b = await (await getList('bob')).json();
  assert.equal(b[0].name, 'Ancient Red Dragon');
  assert.notEqual(b[0].defense.acTotal, 28);
  const g = await (await getList('gm')).json();
  assert.equal(g.length, 2);
  assert.ok(g.every((c) => c.name && c.gmNotes === 'SECRET GM ONLY' && c.acTotal === 28), 'gm sees everything');
  ok('list: per-player filtering, GM sees all');
}

// ---- 4. battle map tokens use the viewing player's unlocks ----
{
  const state = { tokens: [{ id: 't1', creatureId: 'c1', label: 'Ancient Red Dragon', hp: 190, maxHp: 212 }], turnOrder: [] };
  const forAlice = await battle.filterLinkedTokensForPlayer(state, 'camp', 'alice');
  assert.notEqual(forAlice.tokens[0].label, 'Ancient Red Dragon', 'alice: name locked on the token');
  assert.equal(forAlice.tokens[0].hp, 190, 'alice: defense unlocked, HP shown');
  const forBob = await battle.filterLinkedTokensForPlayer(state, 'camp', 'bob');
  assert.equal(forBob.tokens[0].label, 'Ancient Red Dragon', 'bob: name unlocked');
  assert.equal(forBob.tokens[0].hp, undefined, 'bob: defense locked, HP removed');
  ok('battle map: token name/HP follow the viewing player\'s unlocks');
}

// ---- 5. GM manages unlocks per player ----
{
  const ctx = (id) => ({ params: Promise.resolve({ id }) });
  const put = (user, body) => as(user, () => revealsRoute.PUT(new Request('https://t/x', { method: 'PUT', body: JSON.stringify(body) }), ctx('c1')));
  assert.equal((await as('alice', () => revealsRoute.GET(new Request('https://t/x'), ctx('c1')))).status, 403, 'players cannot read the unlock table');
  assert.equal((await put('alice', { userIds: ['alice'], full: true })).status, 403, 'players cannot grant themselves');
  const table = await (await as('gm', () => revealsRoute.GET(new Request('https://t/x'), ctx('c1')))).json();
  same(table.players.map((p) => [p.userId, p.sections, p.full]), [['alice', ['defense'], false], ['bob', ['name', 'offense'], false]], 'GM sees each player (not the GM, not outsiders)');
  assert.equal((await put('gm', { userIds: ['eve'], full: true })).status, 400, 'outsider cannot be granted');
  assert.equal((await put('gm', { userIds: ['gm'], full: true })).status, 400, 'GM is not a player');
  assert.equal((await put('gm', { userIds: ['alice'], grant: ['gmNotes'] })).status, 400, 'unknown section');

  published.length = 0;
  const granted = await put('gm', { userIds: ['alice'], grant: ['name'] });
  assert.equal(granted.status, 200);
  same((await granted.json()).players.find((p) => p.userId === 'alice').sections, ['name', 'defense']);
  assert.equal((await (await getOne('alice', 'c1')).json()).name, 'Ancient Red Dragon', 'grant takes effect for alice');
  assert.notEqual((await (await getOne('bob', 'c1')).json()).defense.acTotal, 28, 'bob unaffected');
  same(published.map((e) => [e.topic, e.userIds]), [['bestiary', ['alice']], ['battle', ['alice']]], 'live refresh targets alice only');

  await put('gm', { userIds: ['alice'], revoke: ['name', 'defense'] });
  assert.equal(db.reveals.some((r) => r.creatureId === 'c1' && r.userId === 'alice'), false, 'empty row deleted on full revoke');
  assert.notEqual((await (await getOne('alice', 'c1')).json()).defense.acTotal, 28, 'revoke takes effect');

  await put('gm', { userIds: ['alice', 'bob'], grant: ['wiki'] });
  const after = await (await as('gm', () => revealsRoute.GET(new Request('https://t/x'), ctx('c1')))).json();
  same(after.players.map((p) => [p.userId, p.sections]), [['alice', ['wiki']], ['bob', ['name', 'offense', 'wiki']]], 'whole-party grant keeps each player\'s own unlocks');
  ok('GM grant/revoke per player and for the whole party; players refused');
}

// ---- 5b. town pages: resident/shopkeeper cards use the viewer's unlocks ----
{
  const town = {
    id: 'town1', campaignId: 'camp', name: 'Emberfall', revealLevel: 'full', unlockedSections: [], wikiPage: null, mapPin: null,
    residents: [{ id: 'r1', role: 'Tyrant', disposition: 'hostile', creatureId: 'c1', creature: dragon }],
    places: [{ id: 'p1', name: 'Lair', type: 'lair', description: '', revealLevel: 'revealed', shopkeeper: dragon }],
  };
  prisma.town = { findUnique: async () => town };
  const townRoute = load('app/api/towns/[id]/route.ts', { ...mocks, '@/lib/towns': load('lib/towns.ts', { ...mocks, './creatures': mocks['@/lib/creatures'] }) });
  const get = (user) => as(user, () => townRoute.GET(new Request('https://t/x'), { params: Promise.resolve({ id: 'town1' }) }));
  const forAlice = await (await get('alice')).json();
  const forBob = await (await get('bob')).json();
  same(forAlice.residents[0].creature.unlockedSections, ['wiki'], 'alice: her own unlocks on the resident card');
  assert.ok(!JSON.stringify(forAlice).includes('Ancient Red Dragon'), 'alice: resident/shopkeeper name stays locked');
  assert.equal(forBob.residents[0].creature.name, 'Ancient Red Dragon');
  assert.equal(forBob.places[0].shopkeeper.name, 'Ancient Red Dragon');
  ok('town page: resident and shopkeeper cards per player');
}

// ---- 6. live updates: targeted events reach only that player (and the GM) ----
{
  const evt = { topic: 'bestiary', userIds: ['alice'], at: 0 };
  assert.equal(realtime.shouldDeliver(evt, 'alice', 'player'), true);
  assert.equal(realtime.shouldDeliver(evt, 'bob', 'player'), false);
  assert.equal(realtime.shouldDeliver(evt, 'gm', 'dm'), true);
  assert.equal(realtime.shouldDeliver({ topic: 'bestiary', at: 0 }, 'bob', 'player'), true, 'untargeted events go to everyone');
  assert.equal(realtime.shouldDeliver({ topic: 'rolls', gmOnly: true, at: 0 }, 'bob', 'player'), false, 'gmOnly unchanged');
  const got = [];
  const unsub = realtime.subscribe('camp', (e) => got.push(e));
  realtime.publish('camp', 'bestiary', { userIds: ['alice'] });
  unsub();
  same(got[0].userIds, ['alice']);
  // The SSE route filters with shouldDeliver for its own (userId, role).
  const sse = readFileSync(new URL('app/api/campaigns/[id]/events/route.ts', root), 'utf8');
  assert.match(sse, /shouldDeliver\(evt, userId, role/);
  ok('realtime: per-player targeting');
}

console.log('CREATURE REVEAL TESTS: PASS');

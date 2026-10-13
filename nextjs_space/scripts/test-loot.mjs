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
  runInNewContext(js, { exports, console: { ...console, error: () => {} }, URL, require: name => name in mocks ? mocks[name] : require(name) });
  return exports;
}
const loot = load('lib/loot.ts');
const validation = load('lib/loot-validation.ts', { './loot': loot });
const { parseDice, rollDice, weightedPick, rollLoot, MAX_CP } = loot;
const item = { kind: 'item', name: 'Ruby', quantity: '2d6+1', valueGp: 3, weight: 0.1, notes: 'Red' };
const coins = { ...item, kind: 'coins', name: '', quantity: '3', valueGp: 0.25 };
assert.equal(parseDice('3').max, 3);
for (const [expression, max] of [[' 3 ', 3], ['1D4', 4], ['1d4 + 1', 5], [' 2D6+ 1 ', 13]]) assert.equal(parseDice(expression).max, max, expression);
assert.equal(rollDice('3', () => { throw Error('constant must not draw'); }), 3);
assert.equal(rollDice('1d4', () => 0), 1);
assert.equal(rollDice('2d6+1', () => 0.99999), 13);
assert.equal(rollDice('100d1000', () => 0.99999), 100000);
for (const expression of ['', '   ', '01', '-1', '1.5', 'd6', '0d6', '1d0', '1d6-1', '1 d 6 - 1', '1d6+1d4', '101d6', '1d1001', '100d1000+1', '100001', '1d6+999999999', 'Infinity']) assert.throws(() => parseDice(expression), undefined, expression);
for (const value of [-0.1, 1, NaN, Infinity]) assert.throws(() => rollDice('1d4', () => value));
const weighted = [{ chance: 0, name: 'never' }, { chance: 1, name: 'a' }, { chance: 3, name: 'b' }];
assert.equal(weightedPick(weighted, () => 0).name, 'a');
assert.equal(weightedPick(weighted, () => 0.25).name, 'b');
assert.equal(weightedPick(weighted, () => 0.99999).name, 'b');
assert.equal(weightedPick([], () => 0), null);
assert.equal(weightedPick([{ chance: 0 }], () => 0), null);
for (const chance of [-1, 1.2, Infinity]) assert.throws(() => weightedPick([{ chance }]));
const result = rollLoot({ rolls: 2, entries: [{ ...item, chance: 1 }] }, [coins], () => 0);
assert.equal(result.cp, 75); assert.equal(result.items.length, 2); assert.equal(result.items[0].quantity, 3);
assert.equal(result.items[0].notes, 'Red');
assert.equal(rollLoot(null, [{ ...coins, valueGp: 0.005, quantity: '1' }]).cp, 1);
assert.equal(rollLoot(null, [{ ...item, quantity: '0' }]).items.length, 0);
assert.equal(rollLoot(null, []).cp, 0);
assert.throws(() => rollLoot({ rolls: 101, entries: [] }, []));
assert.throws(() => rollLoot(null, [{ ...coins, valueGp: 1_000_000, quantity: '100000' }]));
assert.equal(validation.lootEntrySchema.safeParse({ ...item, quantity: 'bad' }).success, false);
assert.equal(validation.lootEntrySchema.safeParse({ ...item, name: '' }).success, false);
assert.equal(validation.lootEntrySchema.safeParse({ ...item, valueGp: NaN }).success, false);
assert.equal(validation.lootEntrySchema.safeParse({ ...item, campaignId: 'other' }).success, false);
assert.equal(validation.lootTableSchema.safeParse({ name: 'Test', rolls: 1, entries: [] }).success, false);
assert.equal(validation.validCoinBudget(null, [{ ...coins, quantity: '100000', valueGp: 1000000 }]), false);

// Route harness: use real validation/auth gate and isolated transaction state.
let user = 'gm', role = 'dm', writes = 0, balance = 0, added = [], missing = false, foreignTable = false, failItem = false;
const table = { id: 'table', campaignId: 'campaign', name: 'Test', rolls: 1, entries: [{ ...item, quantity: '1', chance: 1 }] };
const creature = { lootTableId: 'table', lootList: [coins] };
const responseMock = { NextResponse: { json: (body, options) => Response.json(body, options) } };
const api = load('lib/loot-api.ts', {
  'next/server': responseMock,
  '@/auth': { auth: async () => user ? { user: { id: user } } : null },
  '@/lib/campaign-helpers': { getUserRole: async (_user, campaignId) => campaignId === 'campaign' ? role : null },
});
const scoped = args => { assert.equal(args.where.campaignId, 'campaign'); };
const tx = {
  creature: {
    findFirst: async args => { scoped(args); assert.equal(args.where.id, 'creature'); return missing ? null : creature; },
    update: async args => { scoped(args); writes++; return args.data; },
  },
  lootTable: {
    findFirst: async args => { scoped(args); return foreignTable ? null : table; },
    update: async args => { scoped(args); writes++; return args.data; },
  },
  campaign: { updateMany: async args => {
    assert.equal(args.where.id, 'campaign');
    if (balance > args.where.partyCp.lte) return { count: 0 };
    balance += args.data.partyCp.increment; writes++; return { count: 1 };
  } },
  inventoryItem: { create: async args => {
    assert.equal(args.data.campaignId, 'campaign'); assert.equal(args.data.characterId, null);
    if (failItem) throw Error('simulated failure');
    writes++; added.push(args.data); return args.data;
  } },
};
const prisma = {
  ...tx,
  lootTable: {
    ...tx.lootTable,
    findMany: async args => { scoped(args); return [table]; },
    create: async args => { assert.equal(args.data.campaignId, 'campaign'); writes++; return table; },
    deleteMany: async args => { scoped(args); writes++; return { count: 1 }; },
  },
  $transaction: async fn => {
    const oldBalance = balance, oldAdded = [...added], oldWrites = writes;
    try { return await fn(tx); } catch (error) { balance = oldBalance; added = oldAdded; writes = oldWrites; throw error; }
  },
};
const published = [];
const realtimeMock = { publish: (campaignId, topic, opts) => published.push({ campaignId, topic, ...opts }) };
const mocks = { '@/lib/realtime': realtimeMock, 'next/server': responseMock, '@/lib/prisma': { prisma }, '@/lib/loot-api': api, '@/lib/loot-validation': validation, '@/lib/loot': loot };
const tables = load('app/api/loot-tables/route.ts', mocks);
const settings = load('app/api/creatures/[id]/loot/route.ts', mocks);
const roll = load('app/api/creatures/[id]/roll-loot/route.ts', mocks);
const context = { params: Promise.resolve({ id: 'creature' }) };
const req = (body, method = 'POST') => new Request('https://test/api?campaignId=campaign&id=table', { method, body: JSON.stringify(body) });
const get = () => new Request('https://test/api?campaignId=campaign');
const tableInput = { campaignId: 'campaign', table: { name: 'Test', rolls: 1, entries: table.entries } };
const settingsInput = { campaignId: 'campaign', lootTableId: 'table', lootList: [coins] };
for (const expected of [401, 403]) {
  user = expected === 401 ? null : 'player'; role = 'player';
  for (const run of [() => tables.GET(get()), () => tables.POST(req(tableInput)), () => tables.PUT(req({ ...tableInput, id: 'table' }, 'PUT')), () => tables.DELETE(new Request('https://test/api?campaignId=campaign&id=table', { method: 'DELETE' })), () => settings.GET(get(), context), () => settings.PUT(req(settingsInput, 'PUT'), context), () => roll.POST(req({ campaignId: 'campaign' }), context)]) assert.equal((await run()).status, expected);
}
assert.equal(writes, 0);
user = 'gm'; role = 'dm';
assert.equal((await tables.GET(new Request('https://test/api?campaignId=other'))).status, 403);
assert.equal((await roll.POST(req({ campaignId: 'other' }), context)).status, 403);
assert.equal((await tables.POST(req({ ...tableInput, table: { ...tableInput.table, rolls: 1000 } }))).status, 400);
assert.equal((await settings.PUT(req({ ...settingsInput, lootList: [{ ...item, quantity: 'bad' }] }, 'PUT'), context)).status, 400);
assert.equal((await tables.POST(req(null))).status, 400);
assert.equal((await tables.PUT(req(tableInput, 'PUT'))).status, 400);
assert.equal((await tables.DELETE(new Request('https://test/api?campaignId=campaign', { method: 'DELETE' }))).status, 400);
assert.equal((await settings.GET(new Request('https://test/api?campaignId=campaign&unknown=value'), context)).status, 400);
assert.equal((await roll.POST(req({ campaignId: 'campaign', extra: true }), context)).status, 400);
foreignTable = true;
assert.equal((await settings.PUT(req(settingsInput, 'PUT'), context)).status, 400);
assert.equal((await roll.POST(req({ campaignId: 'campaign' }), context)).status, 400);
assert.equal(writes, 0); foreignTable = false; missing = true;
assert.equal((await roll.POST(req({ campaignId: 'campaign' }), context)).status, 404);
assert.equal((await settings.PUT(req(settingsInput, 'PUT'), context)).status, 404);
missing = false;
assert.equal((await settings.PUT(req(settingsInput, 'PUT'), context)).status, 200);
assert.equal((await tables.POST(req(tableInput))).status, 201);
assert.equal((await tables.PUT(req({ ...tableInput, id: 'table' }, 'PUT'))).status, 200);
assert.equal((await tables.DELETE(new Request('https://test/api?campaignId=campaign&id=table', { method: 'DELETE' }))).status, 200);
const reward = await roll.POST(req({ campaignId: 'campaign' }), context);
assert.equal(reward.status, 200); assert.equal((await reward.json()).cp, 75);
assert.equal(balance, 75); assert.equal(added.length, 1);
balance = MAX_CP - 74;
const beforeWrites = writes;
assert.equal((await roll.POST(req({ campaignId: 'campaign' }), context)).status, 400);
assert.equal(writes, beforeWrites); assert.equal(added.length, 1);
balance = 0; failItem = true;
assert.equal((await roll.POST(req({ campaignId: 'campaign' }), context)).status, 500);
assert.equal(balance, 0); assert.equal(writes, beforeWrites); assert.equal(added.length, 1);
// Existing creature APIs must also keep loot private, including full reveal.
const creatures = load('lib/creatures.ts', { '@/lib/s3': { getFileUrl: async () => null } });
const row = { id: 'creature', campaignId: 'campaign', name: 'Beast', lootTableId: 'secret-table', lootList: [item], lootTable: table, gmNotes: 'Secret', unlockedSections: [] };
for (const revealLevel of ['hidden', 'unknown', 'named', 'full']) {
  const presented = await creatures.presentCreature({ ...row, revealLevel }, 'player');
  if (revealLevel === 'hidden') assert.equal(presented, null);
  else for (const key of ['lootTableId', 'lootList', 'lootTable', 'gmNotes']) assert.equal(key in presented, false);
}
assert.equal((await creatures.presentCreature({ ...row, revealLevel: 'full' }, 'dm')).lootTableId, 'secret-table');
const creatureRoutes = load('app/api/creatures/route.ts', {
  '@/lib/realtime': realtimeMock,
  'next/server': responseMock,
  '@/auth': { auth: async () => ({ user: { id: 'player' } }) },
  '@/lib/prisma': { prisma: { creature: { findUnique: async () => ({ ...row, revealLevel: 'full' }), findMany: async () => [{ ...row, revealLevel: 'full' }] } } },
  '@/lib/campaign-helpers': { getUserRole: async () => 'player' },
  '@/lib/creatures': creatures,
});
for (const query of ['id=creature', 'campaignId=campaign']) {
  const response = await creatureRoutes.GET(new Request(`https://test/api?${query}`));
  assert.equal(response.status, 200);
  const body = await response.json();
  for (const entry of Array.isArray(body) ? body : [body]) for (const key of ['lootTableId', 'lootList', 'lootTable']) assert.equal(key in entry, false);
}
assert.ok(published.length > 0 && published.every((e) => e.topic === 'battle' && !e.gmOnly), 'loot writes publish battle invalidations');
console.log('Loot dice, weights, coins, validation, GM access, campaign scoping, player privacy, balance limits, and transaction rollback tests passed.');

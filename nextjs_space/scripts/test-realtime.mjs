#!/usr/bin/env node
// Realtime (SSE) tests.
//  1. Unit: lib/realtime.ts bus (always runs).
//  2. Integration (when REALTIME_BASE is set, e.g. http://localhost:3123 against
//     a local `next start` on a TEST database, started with REALTIME_HEARTBEAT_MS=1000):
//     GM + player sessions; proves hidden tokens / secret rolls never reach the
//     player's stream or refetch, and that removing membership closes the stream.
//     Needs DATABASE_URL (same test DB) to delete the membership.
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
  runInNewContext(js, { exports, globalThis: {}, Date, console, require: (n) => (n in mocks ? mocks[n] : require(n)) });
  return exports;
}

// ---- 1. bus ----
{
  const rt = load('lib/realtime.ts');
  const a = [], b = [];
  const ua = rt.subscribe('c1', (e) => a.push(e));
  const ub = rt.subscribe('c2', (e) => b.push(e));
  rt.publish('c1', 'battle', { version: 7 });
  rt.publish('c1', 'rolls', { gmOnly: true });
  rt.publish('c2', 'rolls');
  rt.publish('', 'battle');
  assert.equal(a.length, 2);
  assert.deepEqual({ ...a[0], at: 0 }, { topic: 'battle', version: 7, at: 0 });
  assert.equal(a[1].gmOnly, true);
  assert.equal(a[1].version, undefined);
  assert.equal(b.length, 1);
  assert.equal(rt.listenerCount('c1'), 1);
  ua(); ub();
  assert.equal(rt.listenerCount('c1'), 0);
  rt.publish('c1', 'battle'); // no listeners: must not throw
  rt.subscribe('c3', () => { throw new Error('boom'); });
  assert.doesNotThrow(() => rt.publish('c3', 'battle'));
  // Events never carry payload fields beyond topic/version/gmOnly/at.
  for (const e of a) for (const k of Object.keys(e)) assert.ok(['topic', 'version', 'gmOnly', 'at'].includes(k), k);
  console.log('ok   realtime bus');
}

const BASE = process.env.REALTIME_BASE;
if (!BASE) { console.log('skip integration (set REALTIME_BASE to run)'); console.log('REALTIME TESTS: PASS'); process.exit(0); }

// ---- 2. integration ----
function client() {
  const jar = {};
  const cookies = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const save = (r) => (r.headers.getSetCookie?.() || []).forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); });
  const req = async (method, p, body, extra = {}) => {
    const r = await fetch(BASE + p, { method, redirect: 'manual', headers: { cookie: cookies(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, ...extra });
    save(r); return r;
  };
  const login = async (email, password) => {
    const s = await req('POST', '/api/signup', { email, password, displayName: email.split('@')[0] });
    assert.ok(s.ok || s.status === 409, `signup ${s.status}`);
    const { csrfToken } = await (await req('GET', '/api/auth/csrf')).json();
    const r = await fetch(BASE + '/api/auth/callback/credentials', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookies() }, body: new URLSearchParams({ csrfToken, email, password }) });
    save(r);
    const sess = await (await req('GET', '/api/auth/session')).json();
    assert.ok(sess?.user?.id, 'login failed');
    return sess.user.id;
  };
  const stream = async (campaignId) => {
    const ac = new AbortController();
    const r = await fetch(`${BASE}/api/campaigns/${campaignId}/events`, { headers: { cookie: cookies() }, signal: ac.signal });
    const s = { status: r.status, raw: '', events: [], closed: false, abort: () => ac.abort() };
    if (r.status !== 200) return s;
    assert.match(r.headers.get('content-type') || '', /text\/event-stream/);
    (async () => {
      const dec = new TextDecoder();
      try {
        for await (const chunk of r.body) {
          s.raw += dec.decode(chunk, { stream: true });
          let i;
          while ((i = s.raw.indexOf('\n\n', s.parsed ?? 0)) !== -1) {
            const block = s.raw.slice(s.parsed ?? 0, i); s.parsed = i + 2;
            const ev = /^event: (.*)$/m.exec(block)?.[1]; const data = /^data: (.*)$/m.exec(block)?.[1];
            if (ev) s.events.push({ event: ev, data: data ? JSON.parse(data) : null });
          }
        }
      } catch { /* aborted */ }
      s.closed = true;
    })();
    return s;
  };
  const logout = () => { for (const k of Object.keys(jar)) delete jar[k]; };
  return { req, login, stream, logout };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms, what) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return; await sleep(50); } throw new Error(`timeout: ${what}`); };
const step = async (name, fn) => { try { await fn(); console.log(`ok   ${name}`); } catch (e) { console.error(`FAIL ${name}: ${e.stack || e.message}`); console.error('REALTIME TESTS: FAIL'); process.exit(1); } };

const tag = Date.now();
const SECRET_TOKEN = `SECRET_TOKEN_${tag}`;
const gm = client(), pl = client(), outsider = client(), anon = client();
let campaignId, inviteCode, gmS, plS, playerId;

await step('login GM, player, outsider', async () => {
  await gm.login(`rt_gm_${tag}@example.com`, `Pw!${tag}`);
  playerId = await pl.login(`rt_pl_${tag}@example.com`, `Pw!${tag}`);
  await outsider.login(`rt_out_${tag}@example.com`, `Pw!${tag}`);
  const c = await (await gm.req('POST', '/api/campaigns', { name: `Realtime test ${tag}` })).json();
  campaignId = c.id; inviteCode = c.inviteCode;
  assert.ok((await pl.req('POST', '/api/campaigns/join', { code: inviteCode })).ok);
});
await step('stream auth: 401 anonymous, 403 non-member', async () => {
  assert.equal((await anon.stream(campaignId)).status, 401);
  assert.equal((await outsider.stream(campaignId)).status, 403);
});
await step('GM + player streams open (ready)', async () => {
  gmS = await gm.stream(campaignId); plS = await pl.stream(campaignId);
  assert.equal(gmS.status, 200); assert.equal(plS.status, 200);
  await until(() => gmS.events.some((e) => e.event === 'ready') && plS.events.some((e) => e.event === 'ready'), 5000, 'ready');
});
await step('hidden token: invalidate only, filtered refetch', async () => {
  const cur = await (await gm.req('GET', `/api/maps/battle?campaignId=${campaignId}`)).json();
  const state = { gridWidth: 20, gridHeight: 20, tokens: [
    { id: 'vis', name: 'Visible Goblin', x: 1, y: 1 },
    { id: 'sec', name: SECRET_TOKEN, x: 2, y: 2, hidden: true },
  ], turnOrder: [{ id: 'te_1_sec', tokenId: 'sec', name: SECRET_TOKEN, init: 20 }, { id: 'te_1_vis', tokenId: 'vis', name: 'Visible Goblin', init: 5 }] };
  const r = await gm.req('PUT', '/api/maps/battle', { campaignId, state, version: cur.version ?? 0 });
  assert.equal(r.status, 200, await r.clone().text());
  const { version } = await r.json();
  await until(() => plS.events.some((e) => e.event === 'update' && e.data.topic === 'battle'), 3000, 'player battle event');
  await until(() => gmS.events.some((e) => e.event === 'update' && e.data.topic === 'battle'), 3000, 'gm battle event');
  const ev = plS.events.find((e) => e.event === 'update' && e.data.topic === 'battle');
  assert.deepEqual(ev.data, { topic: 'battle', version });
  assert.ok(!plS.raw.includes(SECRET_TOKEN) && !plS.raw.includes('Visible Goblin'), 'stream carries no payload');
  const pv = await (await pl.req('GET', `/api/maps/battle?campaignId=${campaignId}`)).text();
  assert.ok(pv.includes('Visible Goblin'), 'player sees visible token');
  assert.ok(!pv.includes(SECRET_TOKEN), 'player refetch must not include hidden token');
  const gv = await (await gm.req('GET', `/api/maps/battle?campaignId=${campaignId}`)).text();
  assert.ok(gv.includes(SECRET_TOKEN), 'GM sees hidden token');
});
await step('secret roll: GM-only event, filtered refetch', async () => {
  const before = plS.events.length;
  const r = await gm.req('POST', '/api/dice-rolls', { campaignId, expression: '1d20+1337', isSecret: true });
  assert.equal(r.status, 201);
  await until(() => gmS.events.some((e) => e.event === 'update' && e.data.topic === 'rolls'), 3000, 'gm rolls event');
  await sleep(700);
  assert.ok(!plS.events.slice(before).some((e) => e.data?.topic === 'rolls'), 'player must not get secret-roll event');
  assert.ok(!plS.raw.includes('1337'));
  const rolls = await (await pl.req('GET', `/api/dice-rolls?campaignId=${campaignId}&limit=100`)).json();
  assert.ok(!rolls.some((x) => x.isSecret || x.expression.includes('1337')), 'player refetch has no secret roll');
  const pub = await pl.req('POST', '/api/dice-rolls', { campaignId, expression: '1d6' });
  assert.equal(pub.status, 201);
  await until(() => plS.events.some((e) => e.data?.topic === 'rolls'), 3000, 'player public rolls event');
});
await step('re-auth: 401 when signed out, stream reopens after login', async () => {
  const email = `rt_gm_${tag}@example.com`;
  const extra = client();
  await extra.login(email, `Pw!${tag}`);
  extra.logout();
  const s1 = await extra.stream(campaignId);
  assert.equal(s1.status, 401, 'signed-out probe must be 401 (client goes dormant, checks session)');
  const sess = await (await extra.req('GET', '/api/auth/session')).json();
  assert.ok(!sess?.user, 'session endpoint reports no user when signed out');
  await extra.login(email, `Pw!${tag}`);
  const s2 = await extra.stream(campaignId);
  assert.equal(s2.status, 200);
  await until(() => s2.events.some((e) => e.event === 'ready'), 5000, 'ready after re-login');
  s2.abort();
});
await step('membership removal closes player stream', async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.campaignMembership.delete({ where: { userId_campaignId: { userId: playerId, campaignId } } });
    await until(() => plS.closed, 8000, 'player stream closed');
    assert.ok(plS.events.some((e) => e.event === 'bye' && e.data.reason === 'not-a-member'));
    assert.ok(!gmS.closed, 'GM stream stays open');
    assert.equal((await pl.stream(campaignId)).status, 403);
  } finally {
    gmS.abort();
    await prisma.campaign.delete({ where: { id: campaignId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { email: { in: [`rt_gm_${tag}@example.com`, `rt_pl_${tag}@example.com`, `rt_out_${tag}@example.com`] } } }).catch(() => {});
    await prisma.$disconnect();
  }
});
console.log('REALTIME TESTS: PASS');
process.exit(0);

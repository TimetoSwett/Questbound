#!/usr/bin/env node
// Cyberpunk 2020 thin-MVP guardrail smoke (API level). Needs a running app on a scratch DB.
// Usage: BASE=http://localhost:3000 node scripts/test-cp-guardrails.mjs
const BASE = process.env.BASE || `http://localhost:${process.env.PORT || 3000}`;
const email = `cpsmoke_${Date.now()}@example.com`, password = `Smoke!${Date.now()}`;
const jar = {};
const ck = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
const save = (r) => (r.headers.getSetCookie?.() || []).forEach((c) => { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); });
const req = async (method, p, body) => { const r = await fetch(BASE + p, { method, redirect: 'manual', headers: { cookie: ck(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); save(r); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j, h: r.headers }; };
let fails = 0;
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); if (!ok) fails++; };
const STATS = ['INT', 'REF', 'TECH', 'COOL', 'ATTR', 'LUCK', 'MA', 'BODY', 'EMP'];

// auth
let r = await req('GET', '/api/auth/csrf'); const { csrfToken } = r.j;
await req('POST', '/api/signup', { email, password, name: 'CP Smoke' });
r = await fetch(BASE + '/api/auth/callback/credentials', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: ck() }, body: new URLSearchParams({ csrfToken, email, password }) }); save(r);
r = await req('GET', '/api/auth/session'); check('login', !!r.j?.user, JSON.stringify(r.j));

// 1. PF campaign default
r = await req('POST', '/api/campaigns', { name: 'PF Smoke' }); const pf = r.j;
check('1 PF campaign defaults to pf1e', pf.system === 'pf1e', JSON.stringify(pf).slice(0, 200));
r = await req('POST', '/api/characters', { campaignId: pf.id, name: 'Valeros' }); const pfc = r.j;
check('1 PF character created with cyberpunk null', r.s === 200 && pfc.cyberpunk == null, JSON.stringify(pfc.cyberpunk));
// 4. PF PUT without cyberpunk
r = await req('PUT', '/api/characters', { id: pfc.id, name: 'Valeros II', str: 16, notes: 'pf notes' });
check('4 PF PUT without cyberpunk succeeds', r.s === 200, `${r.s} ${JSON.stringify(r.j).slice(0, 200)}`);
r = await req('GET', `/api/characters/single?id=${pfc.id}`);
check('1/4 PF edits persist, cyberpunk stays null', r.j?.name === 'Valeros II' && r.j?.str === 16 && r.j?.cyberpunk == null, JSON.stringify({ n: r.j?.name, s: r.j?.str, c: r.j?.cyberpunk }));
r = await req('PUT', '/api/characters', { id: pfc.id, cyberpunk: { stats: {}, role: 'Solo', skills: [] } });
check('4 PF PUT with cyberpunk blob rejected (400)', r.s === 400, `${r.s}`);
r = await req('PUT', '/api/characters', { id: pfc.id, cyberpunk: null });
check('4 PF PUT cyberpunk:null allowed', r.s === 200, `${r.s}`);
r = await req('POST', '/api/campaigns', { name: 'Bad', system: 'dnd5e' });
check('invalid system rejected', r.s === 400, `${r.s}`);
r = await req('POST', '/api/characters', { campaignId: pf.id, name: 'Ignore client system', system: 'cyberpunk2020' });
check('1 campaign system beats client system', r.s === 200 && r.j?.cyberpunk == null, JSON.stringify(r.j?.cyberpunk));
r = await req('POST', '/api/characters', { name: 'Vault PF' });
const vaultPf = r.j;
check('vault PF character stays cyberpunk null', r.s === 200 && vaultPf?.campaignId == null && vaultPf?.cyberpunk == null, JSON.stringify(vaultPf?.cyberpunk));
r = await req('PUT', '/api/characters', { id: vaultPf.id, cyberpunk: { stats: {}, role: 'Solo', skills: [] } });
check('vault PF PUT cyberpunk rejected (400)', r.s === 400, `${r.s}`);
r = await req('POST', '/api/characters', { name: 'Vault CP', system: 'cyberpunk2020' });
const vaultCp = r.j;
check('vault CP seeds sheet without a campaign', r.s === 200 && vaultCp?.campaignId == null && STATS.every((s) => vaultCp?.cyberpunk?.stats?.[s] === 5) && vaultCp?.cyberpunk?.role === '', JSON.stringify(vaultCp?.cyberpunk));
const vaultEdited = { stats: { ...(vaultCp?.cyberpunk?.stats ?? {}), REF: 7 }, role: 'Solo', skills: [] };
r = await req('PUT', '/api/characters', { id: vaultCp?.id, cyberpunk: vaultEdited });
check('vault CP PUT saves', r.s === 200, `${r.s} ${JSON.stringify(r.j).slice(0, 180)}`);

// 2/3. CP campaign + character
r = await req('POST', '/api/campaigns', { name: 'Night City', system: 'cyberpunk2020' }); const cp = r.j;
check('2 CP campaign system cyberpunk2020', cp.system === 'cyberpunk2020', JSON.stringify(cp).slice(0, 200));
r = await req('GET', '/api/campaigns'); const listed = (Array.isArray(r.j) ? r.j : r.j?.campaigns || []).map((x) => x.campaign || x);
check('2 campaign list exposes system', listed.some((c) => c.id === cp.id && c.system === 'cyberpunk2020') && listed.some((c) => c.id === pf.id && c.system === 'pf1e'), JSON.stringify(listed).slice(0, 300));
r = await req('POST', '/api/characters', { campaignId: cp.id, name: 'Johnny' }); const cpc = r.j;
const seeded = cpc.cyberpunk;
check('3 CP character seeded: all stats 5, empty role/skills', seeded && STATS.every((s) => seeded.stats?.[s] === 5) && seeded.role === '' && Array.isArray(seeded.skills) && seeded.skills.length === 0, JSON.stringify(seeded));
const edited = { stats: { ...seeded.stats, REF: 8, COOL: 9 }, role: 'Rockerboy', skills: [{ name: 'Charismatic Leadership', stat: 'COOL', value: 6 }] };
r = await req('PUT', '/api/characters', { id: cpc.id, cyberpunk: edited });
check('3 CP PUT edits save', r.s === 200, `${r.s} ${JSON.stringify(r.j).slice(0, 200)}`);
r = await req('GET', `/api/characters/single?id=${cpc.id}`);
// v2 persists the edited stats/role/skills and also stores the expanded sections.
const sheet = r.j?.cyberpunk;
const legacyView = sheet && {
  stats: sheet.stats,
  role: sheet.role,
  skills: (sheet.skills || []).map(({ name, stat, value }) => ({ name, stat, value })),
};
check('3 CP reload persists', canon(legacyView) === canon(edited), JSON.stringify(legacyView));
r = await req('PUT', '/api/characters', { id: cpc.id, cyberpunk: 'garbage' });
check('3 CP malformed blob rejected (400)', r.s === 400, `${r.s}`);

// 5. dice in CP campaign + paging
const ids = [];
for (let i = 0; i < 5; i++) { r = await req('POST', '/api/dice-rolls', { campaignId: cp.id, expression: '1d10+2' }); if (r.s >= 200 && r.s < 300) ids.push(r.j.id); }
check('5 dice roll in CP campaign', ids.length === 5, `${r.s} ${JSON.stringify(r.j).slice(0, 200)}`);
r = await req('GET', `/api/dice-rolls?campaignId=${cp.id}&limit=100`); const rolls = Array.isArray(r.j) ? r.j : r.j?.rolls || [];
check('5 rolls appear in log', ids.every((id) => rolls.some((x) => x.id === id)), JSON.stringify(r.j).slice(0, 200));
r = await req('GET', `/api/dice-rolls?campaignId=${cp.id}&limit=2`); const p1 = Array.isArray(r.j) ? r.j : r.j?.rolls || []; const cur = r.h.get('x-next-cursor');
check('5 paging: page1 size 2 + X-Next-Cursor', p1.length === 2 && !!cur, `${p1.length} ${cur}`);
r = await req('GET', `/api/dice-rolls?campaignId=${cp.id}&limit=2&cursor=${encodeURIComponent(cur)}`); const p2 = Array.isArray(r.j) ? r.j : r.j?.rolls || [];
check('5 paging: page2 disjoint, older', p2.length === 2 && p2.every((x) => !p1.some((y) => y.id === x.id)), JSON.stringify(r.j).slice(0, 200));

// pages render
for (const p of [`/campaign/${pf.id}`, `/campaign/${cp.id}`, '/dashboard']) { r = await req('GET', p); check(`page ${p.split('/')[1]} renders 200`, r.s === 200, `${r.s}`); }

console.log(fails ? `CP GUARDRAILS: FAIL (${fails})` : 'CP GUARDRAILS: PASS');
process.exit(fails ? 1 : 0);

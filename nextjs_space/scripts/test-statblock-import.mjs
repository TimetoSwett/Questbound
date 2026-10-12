import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'import-test-'));
const require = createRequire(import.meta.url);
try {
  const ts = require('typescript');
  for (const name of ['statblock-import', 'statblock-fetch', 'statblock-rate-limit']) {
    const source = readFileSync(join(root, `lib/${name}.ts`), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    writeFileSync(join(out, `${name}.js`), outputText);
  }
  const { extractStatblockText, parseStatblockText } = require(join(out, 'statblock-import.js'));
  const { validateImportUrl, fetchStatblockHtml: fetchHtml, isBlockedImportAddress, MAX_IMPORT_BYTES } = require(join(out, 'statblock-fetch.js'));
  const publicDns = async () => [{ address: '8.8.8.8', family: 4 }];
  const fetchStatblockHtml = (url, fetcher, timeout) => fetchHtml(url, fetcher, timeout, publicDns);
  for (const address of ['0.0.0.0', '0.1.2.3', '10.1.2.3', '127.0.0.1', '169.254.1.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1', '100.127.255.255', '224.0.0.1', '239.255.255.255', '255.255.255.255', '::', '::1', 'fc00::1', 'fdff::1', 'fe80::1', 'febf::1', 'fec0::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '0:0:0:0:0:ffff:c0a8:101', '::ffff:100.64.1.1', '::ffff:e000:1', '192.0.0.1', '198.18.0.1', '198.19.255.255', '::ffff:198.18.0.1', 'invalid']) {
    assert.equal(isBlockedImportAddress(address), true, address);
  }
  for (const address of ['8.8.8.8', '100.63.255.255', '100.128.0.0', '172.15.255.255', '172.32.0.0', '169.253.1.1', '223.255.255.255', '2001:4860:4860::8888', '2606:4700:4700::1111', '::ffff:8.8.8.8', '::ffff:808:808', '192.0.1.1', '198.17.255.255', '198.20.0.0']) {
    assert.equal(isBlockedImportAddress(address), false, address);
  }
  for (const answers of [[], [{ address: '127.0.0.1', family: 4 }], [...await publicDns(), { address: '::1', family: 6 }]]) {
    await assert.rejects(fetchHtml('https://aonprd.com', async () => { throw new Error('must not fetch'); }, 100, async () => answers), /Blocked address/);
  }
  await assert.rejects(fetchHtml('https://aonprd.com', async () => { throw new Error('must not fetch'); }, 100, async () => { throw new Error('DNS failure'); }), /DNS failure/);
  await assert.rejects(fetchHtml('https://aonprd.com', async () => { throw new Error('must not fetch'); }, 5, async () => new Promise(() => {})), /timed out/);
  const { importRateLimited } = require(join(out, 'statblock-rate-limit.js'));
  for (let i = 0; i < 10; i++) assert.equal(importRateLimited('limit-user', 1000 + i), false);
  assert.equal(importRateLimited('limit-user', 1010), true);
  assert.equal(importRateLimited('other-user', 1010), false);
  assert.equal(importRateLimited('limit-user', 61_000), false);
  assert.equal(importRateLimited('limit-user', 61_000), true); // Only the oldest hit expired.
  assert.equal(importRateLimited('limit-user', 121_000), false);
  const routeSource = readFileSync(join(root, 'app/api/creatures/import/route.ts'), 'utf8');
  const routeJs = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const routeExports = {};
  let routeUser = 'route-user';
  runInNewContext(routeJs, { exports: routeExports, require: name => {
    const mocks = {
      'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
      '@/auth': { auth: async () => routeUser ? { user: { id: routeUser } } : null },
      '@/lib/campaign-helpers': { getUserRole: async () => 'dm' },
      '@/lib/creatures': { creatureInputSchema: { safeParse: () => ({ success: true }) } },
      '@/lib/statblock-rate-limit': { importRateLimited },
      '@/lib/statblock-import': { extractStatblockText, parseStatblockText },
      '@/lib/statblock-fetch': { fetchStatblockHtml },
    };
    assert.ok(name in mocks, name);
    return mocks[name];
  } });
  routeUser = null;
  assert.equal((await routeExports.POST(new Request('https://questbound.test', { method: 'POST', body: '{}' }))).status, 401);
  routeUser = 'route-user';
  for (let i = 0; i < 10; i++) assert.equal((await routeExports.POST(new Request('https://questbound.test', { method: 'POST', body: '{}' }))).status, 400);
  const limitedResponse = await routeExports.POST({ json: () => { throw new Error('must not read body'); } });
  assert.equal(limitedResponse.status, 429);
  assert.match((await limitedResponse.json()).error, /Too many imports/);
  for (const site of ['aon', 'd20']) {
    const html = readFileSync(join(root, `tests/fixtures/${site}-goblin.html`), 'utf8');
    const text = extractStatblockText(html, site === 'aon' ? 'aonprd.com' : 'd20pfsrd.com');
    const d = parseStatblockText(text);
    assert.equal(d.name, 'Goblin'); assert.equal(d.cr, '1/3');
    assert.deepEqual([d.acTotal, d.acTouch, d.acFlatFooted], [16, 13, 14]);
    assert.deepEqual([d.hpMax, d.hpCurrent, d.hitDice], [6, 6, '1d10+1']);
    assert.deepEqual([d.fort, d.ref, d.will], [3, 2, -1]);
    assert.deepEqual([d.str, d.dex, d.con, d.int, d.wis, d.cha], [11, 15, 12, 10, 9, 6]);
    assert.deepEqual([d.alignment, d.size, d.type, d.subtype, d.speed], ['NE', 'Small', 'humanoid', 'goblinoid', 30]);
    assert.equal(d.attacks.length, 2); assert.equal(d.attacks[0].bonus, '+2');
    assert.equal(d.attacks[0].damage, '1d4'); assert.equal(d.attacks[1].critical, '×3');
    assert.equal(d.feats[0].name, 'Improved Initiative'); assert.equal(d.skills[0].bonus, '+10');
    assert.equal(d.revealLevel, 'hidden'); assert.deepEqual(d.unlockedSections, []);
    for (const detail of ['XP', 'Init', 'Senses', 'Base Atk', 'CMB', 'CMD', 'Languages']) assert.ok(d.gmNotes.includes(detail));
    assert.deepEqual(parseStatblockText(text), d); // Pasted text uses the same parser.
  }
  const pasted = 'Test Beast CR 2\nN Large magical beast (fire)\nAC 18, touch 10, flat-footed 17\nhp 22 (3d10+6)\nFort +5, Ref +4, Will -1\nSpeed 40 ft., fly 60 ft.\nMelee bite +5 (1d8+3), 2 claws +5 (1d4+3)\nSpace 10 ft.; Reach 5 ft.\nSpecial Attacks roar\nStr 16, Dex 12, Con 14, Int -, Wis 8, Cha 9\nSkills Fly +4, Knowledge (arcana, planes) +3\nSQ scent\nSPECIAL ABILITIES\nRoar (Su) Causes fear.\nUnknown extra detail';
  const beast = parseStatblockText(pasted);
  assert.equal(beast.int, null); assert.equal(beast.attacks.length, 2); assert.equal(beast.skills.length, 2);
  assert.equal(beast.specialAbilities[0].name, 'Roar'); assert.ok(beast.gmNotes.includes('Unknown extra detail'));
  const riders = parseStatblockText(pasted.replace('Melee bite +5 (1d8+3), 2 claws +5 (1d4+3)', 'Melee bite +5 (1d6+4 plus grab), sword +5 (2d6+5/19-20 plus 1d6 fire), claw +5 (1d4/19-20/×3 plus bleed) while raging'));
  assert.deepEqual(riders.attacks.map(({ damage, critical, notes }) => ({ damage, critical, notes })), [
    { damage: '1d6+4', critical: '', notes: 'plus grab' },
    { damage: '2d6+5', critical: '19-20', notes: 'plus 1d6 fire' },
    { damage: '1d4', critical: '19-20/×3', notes: 'plus bleed; while raging' },
  ]);
  const outsideRider = parseStatblockText(pasted.replace('Melee bite +5 (1d8+3), 2 claws +5 (1d4+3)', 'Melee bite +5 (1d8+3) plus grab'));
  assert.equal(outsideRider.attacks[0].notes, 'plus grab');
  assert.throws(() => parseStatblockText('not a stat block'), /Parse failure/);
  for (const host of ['aonprd.com', 'www.aonprd.com', 'd20pfsrd.com', 'www.d20pfsrd.com']) assert.equal(validateImportUrl(`https://${host}/x`).hostname, host);
  for (const url of ['http://aonprd.com', 'https://aonprd.com.evil.test', 'https://evil.test', 'https://localhost', 'https://127.0.0.1', 'https://user@aonprd.com', 'https://aonprd.com:444', 'file:///etc/passwd']) assert.throws(() => validateImportUrl(url), /Blocked host/);
  for (const location of ['https://evil.test', 'https://www.aonprd.com/x']) {
    let calls = 0;
    await assert.rejects(fetchStatblockHtml('https://aonprd.com/x', async (_url, options) => {
      calls++; assert.equal(options.redirect, 'manual'); assert.ok(options.headers['User-Agent']);
      return new Response(null, { status: 302, headers: { location } });
    }), /Redirect refused/); assert.equal(calls, 1);
  }
  await assert.rejects(fetchStatblockHtml('https://evil.test', async () => { throw new Error('must not fetch'); }), /Blocked host/);
  await assert.rejects(fetchStatblockHtml('https://aonprd.com', async () => new Response(new Uint8Array(MAX_IMPORT_BYTES + 1))), /2 MB/);
  await assert.rejects(fetchStatblockHtml('https://aonprd.com', async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))), 5), /timed out/);
  console.log('Stat block parser, route rate limit, IP classifier, DNS, redirect, size, and timeout tests passed.');
} finally { rmSync(out, { recursive: true, force: true }); }

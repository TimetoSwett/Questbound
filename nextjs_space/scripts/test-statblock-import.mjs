import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(join(tmpdir(), 'import-test-'));
const require = createRequire(import.meta.url);
try {
  const ts = require('typescript');
  for (const name of ['statblock-import', 'statblock-fetch']) {
    const source = readFileSync(join(root, `lib/${name}.ts`), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
    writeFileSync(join(out, `${name}.js`), outputText);
  }
  const { extractStatblockText, parseStatblockText } = require(join(out, 'statblock-import.js'));
  const { validateImportUrl, fetchStatblockHtml, MAX_IMPORT_BYTES } = require(join(out, 'statblock-fetch.js'));
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
  console.log('Stat block fixture, paste, allowlist, redirect, size, and timeout tests passed.');
} finally { rmSync(out, { recursive: true, force: true }); }

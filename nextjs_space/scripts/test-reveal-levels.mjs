// Unit test for the creature reveal-level sanitizer (lib/creatures.ts).
// Run: node scripts/test-reveal-levels.mjs   (or: npm run test:reveal)
// No test runner in this repo, so this script compiles the TS source with tsc,
// stubs the server-only imports, and asserts on presentCreature output.
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'lib', 'noop.js'));

// 1. Compile lib/creatures.ts (emits JS despite the @/lib/s3 type-only error).
const outDir = mkdtempSync(join(tmpdir(), 'reveal-test-'));
try {
  execSync(
    `npx tsc lib/creatures.ts --outDir "${outDir}" --module commonjs --target es2020 --esModuleInterop --skipLibCheck`,
    { cwd: root, stdio: 'pipe' },
  );
} catch (e) {
  // tsc exits non-zero on the @/ alias type error but still emits; only fail
  // if nothing was emitted.
}
const compiled = join(outDir, 'creatures.js');

// 2. Stub server-only imports; zod resolves for real from node_modules.
const { readFileSync } = await import('node:fs');
if (!readFileSync(compiled, 'utf8').includes('presentCreature')) {
  console.error('FAIL: compile produced no output');
  process.exit(1);
}
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === '@/lib/s3') return { getFileUrl: async (p) => `https://cdn.test/${p}` };
  if (req === '@prisma/client') return {};
  if (req === 'zod') return origLoad.call(this, join(root, 'node_modules', 'zod'), parent, isMain);
  return origLoad.call(this, req, parent, isMain);
};
const C = require(compiled);

// 3. Test fixture: a fully-statted creature, as a DB row would look.
const base = {
  id: 'c1', campaignId: 'camp1', name: 'Ancient Red Dragon', type: 'Dragon',
  subtype: 'Fire', size: 'Huge', cr: '15', alignment: 'CE', isNpc: false,
  portraitPath: 'p/dragon.png',
  acTotal: 28, acTouch: 12, acFlatFooted: 26, hpMax: 212, hpCurrent: 190,
  hitDice: '17d12+102', fort: 18, ref: 14, will: 17,
  str: 35, dex: 14, con: 27, int: 18, wis: 19, cha: 20, speed: 40,
  attacks: [{ name: 'Bite', bonus: '+28', damage: '2d8+18' }],
  skills: [{ name: 'Perception', bonus: '+26' }],
  feats: [{ name: 'Power Attack' }],
  specialAbilities: [{ name: 'Breath Weapon', description: '60-ft cone of fire' }],
  spells: { slots: { 3: 2 }, known: [{ name: 'Fireball', level: '3' }] },
  gear: [{ name: 'Hoard', quantity: 1 }],
  wikiPageId: null, gmNotes: 'SECRET GM ONLY', playerNotes: 'Afraid of cold iron',
  revealLevel: 'hidden', unlockedSections: [],
  wikiPage: { id: 'w1', title: 'Dragons of the Vale', visibility: 'shared' },
};
const mk = (over) => ({ ...base, ...over });

const RUNE_RE = /^[\sᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ]*$/;
const isRunic = (s) => typeof s === 'string' && s.length > 0 && RUNE_RE.test(s);
const hasDigit = (s) => typeof s === 'string' && /\d/.test(s);

// Recursively collect every value in an object tree.
function* walk(v) {
  yield v;
  if (Array.isArray(v)) for (const x of v) yield* walk(x);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) yield* walk(x);
}

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) pass++;
  else { fail++; console.log('FAIL:', label); }
};

const view = await C.presentCreature(mk({ revealLevel: 'named', unlockedSections: ['defense', 'name'] }), 'player');

// -- Case 1: named + ["defense","name"] -------------------------------------
// Locked offense/statistics values: non-numeric strings or null — never digits.
for (const [section, obj] of [['offense', view.offense], ['statistics', view.statistics]]) {
  for (const v of walk(obj)) {
    if (typeof v === 'number') ok(false, `${section} leaked a number: ${v}`);
    if (typeof v === 'string' && v.length > 0) ok(!hasDigit(v), `${section} string has digits: ${JSON.stringify(v)}`);
  }
}
ok(view.offense.speed === C.LOCKED_NUMBER_FILLER, 'locked speed is the fixed filler');
// Object keys too (spells.slots is keyed by spell level).
ok(!/\d/.test(JSON.stringify(view.offense)), 'locked offense JSON (incl. keys) has no digits');
// Identity fields (except name) stay scrambled until full.
for (const k of ['type', 'subtype', 'size', 'cr', 'alignment']) {
  ok(isRunic(view[k]), `identity field ${k} is runic`);
}
// Unlocked sections are real.
ok(view.name === 'Ancient Red Dragon', 'unlocked name is readable');
ok(view.defense.acTotal === 28 && view.defense.hitDice === '17d12+102', 'unlocked defense is real');
ok(view.portraitUrl === 'https://cdn.test/p/dragon.png', 'portrait shown when name unlocked');
// gmNotes never leaves the server.
ok(!('gmNotes' in view), 'gmNotes absent from player view');
ok(JSON.stringify(view).indexOf('SECRET GM ONLY') === -1, 'gmNotes text absent from payload');

// -- Case 2: unknown + ["defense"] ------------------------------------------
const u = await C.presentCreature(mk({ revealLevel: 'unknown', unlockedSections: ['defense'] }), 'player');
ok(u.defense.acTotal === 28, 'unknown+defense: defense is real');
ok(isRunic(u.name), 'unknown+defense: name stays scrambled');
ok(u.portraitUrl === null, 'unknown+defense: portrait hidden while name locked');
for (const v of walk(u.offense)) {
  if (typeof v === 'number') ok(false, `unknown offense leaked a number: ${v}`);
}

// -- Case 3: full + hidden sanity -------------------------------------------
const f = await C.presentCreature(mk({ revealLevel: 'full' }), 'player');
ok(f.defense.acTotal === 28 && f.statistics.str === 35 && f.type === 'Dragon', 'full: everything real');
ok(!('gmNotes' in f), 'full: gmNotes still absent');
ok((await C.presentCreature(mk({ revealLevel: 'hidden' }), 'player')) === null, 'hidden: null for players');

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

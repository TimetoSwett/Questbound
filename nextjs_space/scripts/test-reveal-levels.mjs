// Unit test for the creature reveal-level sanitizer (lib/creatures.ts).
// Unlocks are per player: presentCreature's 3rd argument is the viewing
// player's own CreatureReveal ({sections, full}); the creature's revealLevel
// only decides hidden vs listed.
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

const view = await C.presentCreature(mk({ revealLevel: 'unknown' }), 'player', { sections: ['defense', 'name'], full: false });

// -- Case 1: player unlocked ["defense","name"] ------------------------------
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

// -- Case 2: player unlocked ["defense"] -------------------------------------
const u = await C.presentCreature(mk({ revealLevel: 'unknown' }), 'player', { sections: ['defense'], full: false });
ok(u.defense.acTotal === 28, 'unknown+defense: defense is real');
ok(isRunic(u.name), 'unknown+defense: name stays scrambled');
ok(u.portraitUrl === null, 'unknown+defense: portrait hidden while name locked');
for (const v of walk(u.offense)) {
  if (typeof v === 'number') ok(false, `unknown offense leaked a number: ${v}`);
}

// -- Case 3: full + hidden sanity -------------------------------------------
const f = await C.presentCreature(mk({ revealLevel: 'unknown' }), 'player', { sections: [], full: true });
ok(f.defense.acTotal === 28 && f.statistics.str === 35 && f.type === 'Dragon', 'full: everything real');
ok(!('gmNotes' in f), 'full: gmNotes still absent');
ok((await C.presentCreature(mk({ revealLevel: 'hidden' }), 'player', { sections: [], full: true })) === null, 'hidden: null for players, even with full unlocks');

// -- Case 4: stat block Special Attacks / SQ follow Offense / Statistics ------
const sasq = { specialAbilities: [
  { name: 'Breath Weapon', description: '60-ft cone of fire' },
  { name: 'Special Attacks', description: 'grab (bite), rend' },
  { name: 'SQ', description: 'change shape' },
] };
const onlySA = await C.presentCreature(mk({ ...sasq, revealLevel: 'unknown' }), 'player', { sections: ['specialAbilities'], full: false });
ok(onlySA.specialAbilities.specialAbilities.length === 1, 'SA/SQ never sent inside specialAbilities');
ok(!('specialAttacks' in onlySA.offense) && !('specialQualities' in onlySA.statistics), 'SA/SQ absent while offense/statistics locked');
const lockedAll = await C.presentCreature(mk({ ...sasq, revealLevel: 'unknown' }), 'player', null);
ok(lockedAll.specialAbilities.specialAbilities.length === 1, 'locked: scrambled SA/SQ items dropped too');
const off = await C.presentCreature(mk({ ...sasq, revealLevel: 'unknown' }), 'player', { sections: ['offense'], full: false });
ok(off.offense.specialAttacks === 'grab (bite), rend' && !('specialQualities' in off.statistics), 'offense reveals SA only');
const st = await C.presentCreature(mk({ ...sasq, revealLevel: 'unknown' }), 'player', { sections: ['statistics'], full: false });
ok(st.statistics.specialQualities === 'change shape' && !('specialAttacks' in st.offense), 'statistics reveals SQ only');
const full = await C.presentCreature(mk({ ...sasq, revealLevel: 'unknown' }), 'player', { sections: [], full: true });
ok(full.offense.specialAttacks === 'grab (bite), rend' && full.statistics.specialQualities === 'change shape', 'full: SA and SQ');

// -- Case 5: per player. Same creature, two players, different unlocks ------
const realOf = (card) => JSON.stringify(card);
const alice = await C.presentCreature(mk({ revealLevel: 'unknown' }), 'player', { sections: ['defense'], full: false });
const bob = await C.presentCreature(mk({ revealLevel: 'unknown' }), 'player', { sections: ['playerNotes'], full: false });
ok(alice.defense.acTotal === 28 && alice.defense.hpMax === 212, 'alice: her defense unlock is real');
ok(bob.defense.acTotal === C.LOCKED_NUMBER_FILLER && bob.defense.hpMax === C.LOCKED_NUMBER_FILLER, 'bob: defense he did not unlock is filler');
ok(!realOf(bob).includes('17d12+102'), 'bob: hit dice text never in his payload');
ok(bob.offense.attacks[0].damage !== '2d8+18' && alice.offense.attacks[0].damage !== '2d8+18', 'offense locked for both');
ok(realOf(bob).includes('Afraid of cold iron') && !realOf(alice).includes('Afraid of cold iron'), 'player notes only for bob, who unlocked them');
ok(alice.revealLevel === 'unknown' && bob.revealLevel === 'unknown', 'neither has the name: level unknown');
const carol = await C.presentCreature(mk({ revealLevel: 'unknown' }), 'player', { sections: ['name'], full: false });
ok(carol.revealLevel === 'named' && carol.name === 'Ancient Red Dragon', 'carol unlocked name: level named');
ok(isRunic(alice.name) && alice.portraitUrl === null, 'alice: name and portrait still locked');
ok(JSON.stringify(alice.unlockedSections) === '["defense"]', 'card lists only this player\'s own unlocks');

// -- Case 6: old party-wide data is ignored -----------------------------------
// The deprecated Creature.unlockedSections and a pre-migration 'full'/'named'
// level must not unlock anything for a player with no CreatureReveal row.
for (const legacy of [{ revealLevel: 'full' }, { revealLevel: 'named', unlockedSections: ['name', 'defense', 'offense'] }]) {
  const card = await C.presentCreature(mk(legacy), 'player', null);
  ok(card && card.revealLevel === 'unknown', `legacy ${legacy.revealLevel}: listed but unknown`);
  ok(isRunic(card.name) && card.defense.acTotal === C.LOCKED_NUMBER_FILLER && card.type !== 'Dragon', `legacy ${legacy.revealLevel}: nothing readable`);
  ok(!realOf(card).includes('Ancient Red Dragon') && !realOf(card).includes('Afraid of cold iron'), `legacy ${legacy.revealLevel}: no real text in payload`);
}

// -- Case 7: GM sees everything regardless of reveals -------------------------
const gm = await C.presentCreature(mk({ revealLevel: 'hidden' }), 'dm', null);
ok(gm.name === 'Ancient Red Dragon' && gm.gmNotes === 'SECRET GM ONLY' && gm.acTotal === 28, 'gm: everything, even hidden');

// -- Case 8: helpers ----------------------------------------------------------
const norm = C.normalizeReveal({ sections: ['defense', 'bogus', 7, 'defense', 'wiki'], full: 'yes' });
ok(JSON.stringify(norm) === JSON.stringify({ sections: ['defense', 'wiki'], full: false }), 'normalizeReveal drops junk/dupes, full must be true');
ok(C.normalizeReveal(null).sections.length === 0 && C.normalizeReveal(undefined).full === false, 'normalizeReveal(null) = nothing');
ok(C.playerRevealLevel('hidden', { sections: ['name'], full: true }) === null, 'playerRevealLevel: hidden wins');
ok(C.playerRevealLevel('bogus', { sections: [], full: true }) === null, 'playerRevealLevel: unknown creature level = hidden');
ok(C.playerRevealLevel('unknown', { sections: ['name'], full: false }) === 'named', 'playerRevealLevel: name -> named');
const A = (cur, upd) => JSON.stringify(C.applyRevealUpdate(cur, upd));
const none = { sections: [], full: false };
ok(A(none, { grant: ['offense', 'name'] }) === JSON.stringify({ sections: ['name', 'offense'], full: false }), 'grant adds (canonical order)');
ok(A({ sections: ['name', 'defense'], full: false }, { revoke: ['name'] }) === JSON.stringify({ sections: ['defense'], full: false }), 'revoke removes, keeps others');
ok(A({ sections: ['name'], full: false }, { sections: ['wiki'] }) === JSON.stringify({ sections: ['wiki'], full: false }), 'sections replaces');
ok(A({ sections: [], full: true }, { revoke: ['defense'] }) === JSON.stringify({ sections: ['name', 'offense', 'statistics', 'specialAbilities', 'playerNotes', 'wiki'], full: false }), 'revoke from full keeps every other section');
ok(A({ sections: ['name'], full: false }, { full: true }) === JSON.stringify({ sections: ['name'], full: true }), 'full toggles on, sections kept');
ok(A({ sections: ['name'], full: true }, { full: false }) === JSON.stringify({ sections: ['name'], full: false }), 'full toggles off');
ok(!C.revealUpdateSchema.safeParse({ userIds: ['u1'] }).success, 'update needs a change');
ok(!C.revealUpdateSchema.safeParse({ userIds: ['u1'], grant: ['gmNotes'] }).success, 'only real sections can be granted');
ok(!C.revealUpdateSchema.safeParse({ userIds: [], full: true }).success, 'update needs a player');
ok(!C.revealUpdateSchema.safeParse({ userIds: ['u1'], full: true, extra: 1 }).success, 'update is strict');

// -- Case 9: GM creature saves can't write party-wide unlocks anymore --------
const saved = C.creatureInputSchema.parse({ revealLevel: 'full', unlockedSections: ['defense'] });
ok(saved.revealLevel === 'unknown' && !('unlockedSections' in saved), 'creature input: full -> unknown, unlockedSections dropped');
ok(C.creatureInputSchema.parse({ revealLevel: 'hidden' }).revealLevel === 'hidden', 'creature input: hidden kept');

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

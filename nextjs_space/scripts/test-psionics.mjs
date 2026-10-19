import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const ts = require('typescript');
function load(path, mocks = {}) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  runInNewContext(js, { exports, URL, Buffer, require: name => name in mocks ? mocks[name] : require(name) });
  return exports;
}
const p = load('lib/psionics.ts');
const plainOf = v => JSON.parse(JSON.stringify(v));
const { spendPP, restorePP, restPool, manifestCost, saveDC, normalizePsionics, defaultPsionics, sanitizeSpellsPsionics } = p;

// Spend: temp first, then current
let r = spendPP({ max: 10, current: 8, temp: 3 }, 5);
assert.deepEqual({ ...r.pool }, { max: 10, current: 6, temp: 0 }); assert.equal(r.ok, true);
r = spendPP({ max: 10, current: 8, temp: 3 }, 2);
assert.deepEqual({ ...r.pool }, { max: 10, current: 8, temp: 1 });
// Insufficient: refused, pool unchanged
const pool = { max: 10, current: 2, temp: 1 };
r = spendPP(pool, 4);
assert.equal(r.ok, false); assert.equal(r.pool, pool); assert.ok(r.error);
assert.equal(spendPP(pool, 3).ok, true);
assert.equal(spendPP(pool, -1).ok, false);
assert.equal(spendPP(pool, 1.5).ok, false);
assert.deepEqual({ ...spendPP(pool, 0).pool }, { ...pool });
// Restore capped at max, temp untouched
assert.deepEqual({ ...restorePP({ max: 10, current: 8, temp: 2 }, 5) }, { max: 10, current: 10, temp: 2 });
assert.equal(restorePP({ max: 10, current: 3, temp: 0 }, 4).current, 7);
assert.equal(restorePP({ max: 10, current: 3, temp: 0 }, -4).current, 3);
assert.equal(restorePP({ max: 10, current: 12, temp: 0 }, 1).current, 10); // over-max current is capped
// Rest
assert.deepEqual({ ...restPool({ max: 10, current: 1, temp: 5 }) }, { max: 10, current: 10, temp: 0 });
// Manifest cost + augment cap at ML
let c = manifestCost({ ppCost: 5 }, 0, 9); assert.deepEqual({ ...c }, { ok: true, cost: 5 });
c = manifestCost({ ppCost: 5 }, 4, 9); assert.deepEqual({ ...c }, { ok: true, cost: 9 });
c = manifestCost({ ppCost: 5 }, 5, 9); assert.equal(c.ok, false); assert.equal(c.cost, 10); assert.ok(c.error);
assert.equal(manifestCost({ ppCost: 1 }, 0, 0).ok, false);
assert.equal(manifestCost({ ppCost: 1 }, -1, 9).ok, false);
assert.equal(manifestCost({ ppCost: 1 }, 1.5, 9).ok, false);
// DC
assert.equal(saveDC(3, 4), 17); assert.equal(saveDC(0, 0), 10); assert.equal(saveDC(5, -2), 13); assert.equal(saveDC(1, -5), 6);

// Zod normalize / clamp
assert.deepEqual(plainOf(normalizePsionics(undefined)), plainOf(defaultPsionics()));
assert.deepEqual(plainOf(normalizePsionics('x')), plainOf(defaultPsionics()));
const messy = normalizePsionics({
  pp: { max: -5, current: 1e9, temp: 3.9 }, manifesterLevel: 99, keyAbility: 'str', psionicFocus: 'yes',
  powers: [{ id: 'a', name: 'x'.repeat(500), level: 42, ppCost: -3, description: 5 }, { name: 'no id' }, null, 'bad'],
});
assert.equal(messy.pp.max, 0); assert.equal(messy.pp.current, 0); // capped to max assert.equal(messy.pp.temp, 3);
assert.equal(messy.manifesterLevel, 40); assert.equal(messy.keyAbility, 'int'); assert.equal(messy.psionicFocus, false);
assert.equal(messy.powers.length, 1);
assert.equal(messy.powers[0].name.length, 100); assert.equal(messy.powers[0].level, 9); assert.equal(messy.powers[0].ppCost, 0); assert.equal(messy.powers[0].description, '');
const many = normalizePsionics({ powers: Array.from({ length: 150 }, (_, i) => ({ id: `p${i}`, name: `P${i}` })) });
assert.equal(many.powers.length, 100);

// Round-trip through the server path: spells JSON with psionics, as the PUT route handles it
const good = { pp: { max: 12, current: 9, temp: 2 }, manifesterLevel: 7, keyAbility: 'wis', psionicFocus: true,
  powers: [{ id: 'z', name: 'Energy Ray', discipline: 'Psychokinesis', level: 1, ppCost: 1, display: 'Au', manifestingTime: '1 standard action', range: 'close', duration: 'instantaneous', save: 'Reflex half', powerResistance: 'yes', augment: '+1d6', description: 'Ray.' }] };
const spells = { slots: { 1: 2 }, known: [{ clientId: 'c1', name: 'Fireball', level: 3 }], pools: [{ name: 'Sorcerer' }], psionics: good };
const stored = JSON.stringify(sanitizeSpellsPsionics(spells));
const back = JSON.parse(stored);
assert.deepEqual(back.psionics, good);
assert.deepEqual(back.known, spells.known); assert.deepEqual(back.slots, spells.slots); assert.deepEqual(back.pools, spells.pools);
assert.deepEqual(plainOf(normalizePsionics(back.psionics)), good);
// Spells without psionics are untouched (same reference); junk psionics get clamped
const plain = { slots: {}, known: [] };
assert.equal(sanitizeSpellsPsionics(plain), plain);
assert.equal(sanitizeSpellsPsionics(null), null); assert.equal(sanitizeSpellsPsionics(undefined), undefined);
assert.deepEqual(plainOf(sanitizeSpellsPsionics({ slots: {}, known: [], psionics: 'junk' }).psionics), plainOf(defaultPsionics()));
// PP cap: current clamped to 0..max on sanitize and restore
assert.deepEqual({ ...sanitizeSpellsPsionics({ psionics: { pp: { max: 10, current: 50, temp: 0 } } }).psionics.pp }, { max: 10, current: 10, temp: 0 });
assert.deepEqual({ ...normalizePsionics({ pp: { max: 5, current: -3, temp: 2 } }).pp }, { max: 5, current: 0, temp: 2 });
assert.deepEqual({ ...p.clampPool({ max: 4, current: 9, temp: 1 }) }, { max: 4, current: 4, temp: 1 });
assert.equal(restorePP({ max: 10, current: 15, temp: 0 }, 1).current, 10);
assert.equal(restorePP({ max: 10, current: 8, temp: 0 }, 5).current, 10);
// Creature (NPC) spells schema is passthrough, so psionics survives and is scrambled with spells when locked
const src = readFileSync(new URL('../lib/creatures.ts', import.meta.url), 'utf8');
assert.ok(/spells: z\.object\(\{ slots: z\.record\(z\.unknown\(\)\), known: jsonList \}\)\.passthrough\(\)/.test(src));
console.log('psionics tests passed');

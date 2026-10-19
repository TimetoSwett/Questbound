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
const pw = load('lib/path-of-war.ts');
const plainOf = v => JSON.parse(JSON.stringify(v));
const { normalizePathOfWar, defaultPathOfWar, sanitizeSpellsPathOfWar, recoverAll, toggleReadied, toggleExpended, setActiveStance, overLimits, saveDC } = pw;

const mk = (id, extra = {}) => ({ id, name: id, discipline: 'Iron Tortoise', level: 1, type: 'strike', readied: false, expended: false, ...extra });
const base = (extra = {}) => normalizePathOfWar({
  maneuvers: [mk('a', { readied: true, expended: true }), mk('b', { expended: true }), mk('c', { readied: true })],
  stances: [{ id: 's1', name: 'One' }, { id: 's2', name: 'Two' }], ...extra,
});

// recover clears expended only
let d = recoverAll(base());
assert.deepEqual(plainOf(d.maneuvers.map(m => m.expended)), [false, false, false]);
assert.deepEqual(plainOf(d.maneuvers.map(m => m.readied)), [true, false, true]);
// toggles
d = toggleReadied(base(), 'b'); assert.equal(d.maneuvers[1].readied, true);
d = toggleReadied(d, 'b'); assert.equal(d.maneuvers[1].readied, false);
d = toggleExpended(base(), 'c'); assert.equal(d.maneuvers[2].expended, true);
assert.equal(toggleReadied(base(), 'nope').maneuvers.filter(m => m.readied).length, 2);
// single active stance
d = setActiveStance(base(), 's1'); assert.equal(d.activeStanceId, 's1');
d = setActiveStance(d, 's2'); assert.equal(d.activeStanceId, 's2');
assert.equal(setActiveStance(d, 'bogus').activeStanceId, null);
assert.equal(setActiveStance(d, null).activeStanceId, null);
assert.equal(base({ activeStanceId: 's2' }).activeStanceId, 's2');
assert.equal(base({ activeStanceId: 'zzz' }).activeStanceId, null);
assert.equal(base({ activeStanceId: 5 }).activeStanceId, null);
// over-limit warnings
assert.deepEqual(plainOf(overLimits(base())), []); // limits 0 = unset
d = base({ limits: { maneuversKnown: 2, maneuversReadied: 1, stancesKnown: 1 } });
assert.equal(overLimits(d).length, 3);
d = base({ limits: { maneuversKnown: 3, maneuversReadied: 2, stancesKnown: 2 } });
assert.deepEqual(plainOf(overLimits(d)), []);
d = base({ limits: { maneuversKnown: 3, maneuversReadied: 1, stancesKnown: 2 } });
assert.equal(overLimits(d).length, 1); assert.match(overLimits(d)[0], /readied/);
// DC
assert.equal(saveDC(3, 4), 17); assert.equal(saveDC(1, -5), 6); assert.equal(saveDC(9, -1), 18);

// clamping
assert.deepEqual(plainOf(normalizePathOfWar(undefined)), plainOf(defaultPathOfWar()));
assert.deepEqual(plainOf(normalizePathOfWar('x')), plainOf(defaultPathOfWar()));
const messy = normalizePathOfWar({
  initiatorLevel: 99, initiationAbility: 'str', disciplines: ['x'.repeat(100), 5, 'ok'],
  maneuvers: [{ id: 'a', name: 'x'.repeat(500), level: 42, type: 'weird', readied: 'yes', description: 5 }, { id: 'l', level: -3 }, { name: 'no id' }, null],
  limits: { maneuversKnown: -4, maneuversReadied: 3.9, stancesKnown: 1e9 },
});
assert.equal(messy.initiatorLevel, 40); assert.equal(messy.initiationAbility, 'int');
assert.deepEqual(plainOf(messy.disciplines), ['x'.repeat(40), 'ok']);
assert.equal(messy.maneuvers.length, 2);
assert.equal(messy.maneuvers[0].name.length, 100); assert.equal(messy.maneuvers[0].level, 9);
assert.equal(messy.maneuvers[0].type, 'other'); assert.equal(messy.maneuvers[0].readied, false); assert.equal(messy.maneuvers[0].description, '');
assert.equal(messy.maneuvers[1].level, 1);
assert.deepEqual(plainOf(messy.limits), { maneuversKnown: 0, maneuversReadied: 3, stancesKnown: 1000 });
const many = normalizePathOfWar({
  maneuvers: Array.from({ length: 300 }, (_, i) => ({ id: `m${i}` })),
  stances: Array.from({ length: 80 }, (_, i) => ({ id: `s${i}` })),
  disciplines: Array.from({ length: 50 }, (_, i) => `d${i}`),
});
assert.equal(many.maneuvers.length, 200); assert.equal(many.stances.length, 50); assert.equal(many.disciplines.length, 30);

// sanitize passes other keys through, leaves spells without pathOfWar untouched
const spells = { slots: { 1: 2 }, known: [{ clientId: 'c1', name: 'Fireball', level: 3 }], pools: [{ name: 'S' }], psionics: { pp: 1 }, pathOfWar: { initiatorLevel: 7, activeStanceId: 'ghost' } };
const out = sanitizeSpellsPathOfWar(spells);
assert.deepEqual(plainOf(out.known), spells.known); assert.deepEqual(plainOf(out.slots), spells.slots);
assert.deepEqual(plainOf(out.pools), spells.pools); assert.deepEqual(plainOf(out.psionics), { pp: 1 });
assert.equal(out.pathOfWar.initiatorLevel, 7); assert.equal(out.pathOfWar.activeStanceId, null);
const plain = { slots: {}, known: [] };
assert.equal(sanitizeSpellsPathOfWar(plain), plain);
assert.equal(sanitizeSpellsPathOfWar(null), null); assert.equal(sanitizeSpellsPathOfWar(undefined), undefined);
assert.deepEqual(plainOf(sanitizeSpellsPathOfWar({ pathOfWar: 'junk' }).pathOfWar), plainOf(defaultPathOfWar()));
console.log('path of war tests passed');

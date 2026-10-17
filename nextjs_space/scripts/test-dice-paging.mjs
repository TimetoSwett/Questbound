// Keyset paging for the dice-roll log: tied-millisecond safety, cursor
// encode/decode round trips, param parsing, and a Prisma-semantics simulator.
import assert from 'node:assert/strict';
// Dynamic import so named exports resolve under tsx on Node 26 (static named imports of .ts from .mjs come through as CJS there).
const {
  compareRollsDesc, decodeRollCursor, encodeRollCursor, isOlderThan,
  keysetWhere, pageOlder, parseRollCursorParams, rollOrder,
} = await import('../lib/dice-roll-cursor.ts');

// Deterministic PRNG so failures reproduce.
let seed = 42;
function rnd() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function cuidLike() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = 'c';
  for (let i = 0; i < 24; i++) s += chars[Math.floor(rnd() * chars.length)];
  return s;
}

// 23 rolls: 14 unique timestamps plus tied groups of 5 and 4 sharing exact
// milliseconds. Stamps are shuffled so insertion order != sorted order.
const base = Date.UTC(2026, 9, 17, 12, 0, 0, 0);
const stamps = [];
for (let i = 0; i < 14; i++) stamps.push(base + i * 7);
for (let i = 0; i < 5; i++) stamps.push(base + 500);
for (let i = 0; i < 4; i++) stamps.push(base + 900);
for (let i = stamps.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [stamps[i], stamps[j]] = [stamps[j], stamps[i]];
}
const rows = stamps.map((ms) => ({ id: cuidLike(), createdAt: new Date(ms) }));
const fullDesc = [...rows].sort(compareRollsDesc);
const fullIds = fullDesc.map((r) => r.id);
assert.equal(rows.length, 23);
assert.equal(new Set(rows.map((r) => r.id)).size, 23, 'ids unique');
assert.equal(new Set(rows.map((r) => +r.createdAt)).size, 16, 'ties present (14 unique + 2 tied groups)');

// --- pageOlder walks everything exactly once, in full desc order ---------
function pageAll(size) {
  const pages = [];
  let token = null;
  let guard = 0;
  while (guard++ < 100) {
    const cursor = token ? decodeRollCursor(token) : null;
    assert.ok(!token || cursor, 'nextCursor must decode');
    const { page, nextCursor } = pageOlder(rows, cursor, size);
    if (!page.length) {
      assert.equal(nextCursor, null, 'empty page has no cursor');
      break;
    }
    pages.push(page);
    if (!nextCursor) break;
    token = nextCursor;
  }
  return pages;
}

let boundaryInsideTie = false;
for (const size of [1, 2, 3, 4, 5, 7, 50]) {
  const pages = pageAll(size);
  const flat = pages.flat();
  assert.deepEqual(flat.map((r) => r.id), fullIds, `size ${size}: full desc order, no skips/dupes`);
  assert.equal(new Set(flat.map((r) => r.id)).size, 23, `size ${size}: every roll exactly once`);
  for (let i = 0; i + 1 < pages.length; i++) {
    const last = pages[i][pages[i].length - 1];
    const first = pages[i + 1][0];
    if (+last.createdAt === +first.createdAt) boundaryInsideTie = true;
  }
}
assert.ok(boundaryInsideTie, 'some page boundary must fall inside a tied group');

// Stable: re-running produces the identical sequence.
assert.deepEqual(pageAll(3).flat().map((r) => r.id), pageAll(3).flat().map((r) => r.id));

// --- encode/decode round trip --------------------------------------------
const tied = rows.filter((r) => +r.createdAt === base + 500);
for (const r of tied) {
  const c = decodeRollCursor(encodeRollCursor(r));
  assert.ok(c, 'round trip decodes');
  assert.equal(+c.createdAt, +r.createdAt, 'ms precision preserved');
  assert.equal(c.id, r.id);
}
assert.equal(decodeRollCursor('not-a-cursor'), null);
assert.equal(decodeRollCursor('nonsense_x'), null); // bad date
assert.equal(decodeRollCursor(`${new Date(base).toISOString()}_`), null); // empty id
assert.equal(decodeRollCursor(`${new Date(base).toISOString()}_${'x'.repeat(65)}`), null); // too long
assert.equal(decodeRollCursor(`${new Date(base).toISOString()}_bad!id`), null); // bad charset

// --- parseRollCursorParams ------------------------------------------------
const iso = new Date(base + 500).toISOString();
const tok = encodeRollCursor({ createdAt: iso, id: 'cabc123' });

const fromNew = parseRollCursorParams(new URLSearchParams(`cursor=${encodeURIComponent(tok)}`), 'before');
assert.deepEqual(fromNew, { cursor: { createdAt: new Date(iso), id: 'cabc123' }, legacyTimestamp: null });

const fromAfterNew = parseRollCursorParams(new URLSearchParams(`afterCursor=${encodeURIComponent(tok)}`), 'after');
assert.deepEqual(fromAfterNew, { cursor: { createdAt: new Date(iso), id: 'cabc123' }, legacyTimestamp: null });

const fromPair = parseRollCursorParams(
  new URLSearchParams(`before=${encodeURIComponent(iso)}&beforeId=cabc123`), 'before',
);
assert.deepEqual(fromPair, { cursor: { createdAt: new Date(iso), id: 'cabc123' }, legacyTimestamp: null });

const fromAfterPair = parseRollCursorParams(
  new URLSearchParams(`after=${encodeURIComponent(iso)}&afterId=cabc123`), 'after',
);
assert.deepEqual(fromAfterPair, { cursor: { createdAt: new Date(iso), id: 'cabc123' }, legacyTimestamp: null });

const legacy = parseRollCursorParams(new URLSearchParams(`before=${encodeURIComponent(iso)}`), 'before');
assert.deepEqual(legacy, { cursor: null, legacyTimestamp: new Date(iso) });
assert.notEqual(legacy, 'invalid');

const legacyAfter = parseRollCursorParams(new URLSearchParams(`after=${encodeURIComponent(iso)}`), 'after');
assert.deepEqual(legacyAfter, { cursor: null, legacyTimestamp: new Date(iso) });

assert.equal(parseRollCursorParams(new URLSearchParams('before=garbage'), 'before'), 'invalid');
assert.equal(parseRollCursorParams(new URLSearchParams('beforeId=cabc123'), 'before'), 'invalid');
assert.equal(parseRollCursorParams(new URLSearchParams('cursor=%99%99'), 'before'), 'invalid');
assert.deepEqual(
  parseRollCursorParams(new URLSearchParams(''), 'before'),
  { cursor: null, legacyTimestamp: null },
);

// --- keysetWhere shape and rollOrder --------------------------------------
const c = { createdAt: new Date(base + 500), id: 'cabc123' };
assert.deepEqual(keysetWhere('before', c), {
  OR: [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: 'cabc123' } }],
});
assert.deepEqual(keysetWhere('after', c), {
  OR: [{ createdAt: { gt: c.createdAt } }, { createdAt: c.createdAt, id: { gt: 'cabc123' } }],
});
assert.deepEqual(rollOrder('before'), [{ createdAt: 'desc' }, { id: 'desc' }]);
assert.deepEqual(rollOrder('after'), [{ createdAt: 'asc' }, { id: 'asc' }]);

// --- Prisma-semantics simulator -------------------------------------------
// Evaluates a keysetWhere fragment ({ OR: [clause...] }) where a clause is
// { createdAt: {lt|gt: value} } or { createdAt: value, id: {lt|gt: value} }.
function matchCond(row, cond) {
  for (const [field, v] of Object.entries(cond)) {
    const rv = field === 'createdAt' ? +new Date(row.createdAt) : row[field];
    if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
      for (const [op, raw] of Object.entries(v)) {
        const cv = raw instanceof Date ? +raw : raw;
        if (op === 'lt' ? !(rv < cv) : op === 'gt' ? !(rv > cv) : rv !== cv) return false;
      }
    } else {
      const cv = v instanceof Date ? +v : v;
      if (rv !== cv) return false;
    }
  }
  return true;
}
const applyWhere = (w, list) => list.filter((r) => (w.OR ? w.OR.some((cond) => matchCond(r, cond)) : true));

for (const r of fullDesc) {
  const cur = decodeRollCursor(encodeRollCursor(r));
  assert.deepEqual(
    applyWhere(keysetWhere('before', cur), fullDesc).map((x) => x.id),
    fullDesc.filter((x) => isOlderThan(x, cur)).map((x) => x.id),
    `prisma semantics match isOlderThan at ${r.id}`,
  );
}

// Simulated server paging (sort, filter, take) equals the pure reference.
for (const size of [1, 2, 3, 5, 7]) {
  const viaPrisma = [];
  let cur = null;
  let guard = 0;
  while (guard++ < 100) {
    const w = cur ? keysetWhere('before', cur) : {};
    const page = applyWhere(w, fullDesc).slice(0, size);
    if (!page.length) break;
    viaPrisma.push(...page);
    if (page.length < size) break;
    cur = decodeRollCursor(encodeRollCursor(page[page.length - 1]));
  }
  assert.deepEqual(viaPrisma.map((r) => r.id), fullIds, `simulated prisma paging matches (size ${size})`);
}

console.log('DICE PAGING TESTS: PASS');

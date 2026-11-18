// DB-free tests for the battle-map JSON ↔ rows codec and read fallback.
import assert from 'node:assert/strict';
import {
  countDocument,
  countState,
  countsMatch,
  documentToState,
  dualWriteLegacyBattleJson,
  resolveBattleRead,
  stateToDocument,
  type BattleDocument,
} from '../lib/battle-map-codec';
import {
  BATTLE_MAP_LIMITS,
  battleMapContentLengthRejection,
  battleMapLimitViolations,
  battleMapWriteRejection,
  type BattleMapLimits,
} from '../lib/battle-map-limits';
import { applyTargetedPlan, battleMapLegacyPayload, planBattleWrite } from '../lib/battle-map-delta';
import { removeCharacterTokens } from '../lib/battle-map';

function roundTrip(state: unknown): { document: BattleDocument; state: Record<string, unknown> } {
  const encoded = stateToDocument(state);
  assert.equal(encoded.ok, true, encoded.ok ? '' : encoded.reason);
  if (!encoded.ok) throw new Error('unreachable');
  const back = documentToState(encoded.document);
  assert.deepEqual(back, state);
  assert.equal(countsMatch(state, encoded.document), true, JSON.stringify({ state: countState(state), rows: countDocument(encoded.document) }));
  // Postgres jsonb / a wire round-trip keeps values and drops nothing here.
  const viaJson = JSON.parse(JSON.stringify(encoded.document)) as BattleDocument;
  assert.deepEqual(documentToState(viaJson), state);
  const again = stateToDocument(back);
  assert.equal(again.ok, true);
  if (!again.ok) throw new Error('unreachable');
  assert.deepEqual(documentToState(again.document), state);
  return { document: encoded.document, state: back };
}

const full = {
  gridWidth: 30,
  gridHeight: 20,
  backgroundImage: 'maps/keep.png',
  feetPerSquare: 5,
  cellNumbers: false,
  activeId: null as string | null,
  handout: { key: 'handouts/note.png', pushedAt: 1_700_000_000_000, caption: 'Show this' },
  notes: 'GM only',
  gmNotes: { secret: true },
  customMarker: { nested: [1, 'a', null] },
  fog: ['0,0', '1,2', '1,2', '01,2', 'nope', 4, null],
  tokens: [
    null,
    1,
    'stray',
    {
      id: 't1',
      label: 'Goblin',
      color: '#ff0000',
      x: 3,
      y: 4,
      size: 0.5,
      hidden: false,
      characterId: 'char_1',
      characterName: 'Kara',
      portraitKey: 'portraits/kara.png',
      hp: 0,
      maxHp: 12,
      conditions: ['Prone', 'Shaken'],
      creatureId: 'cre_1',
      aura: { radius: 2 },
    },
    { id: 't2', label: 'Bad hp', hp: 'full', x: 1, y: 1, size: 1, color: '#fff' },
  ],
  highlights: [
    { id: 'h1', x: 1, y: 2, w: 3, h: 4, color: '#00ff00', label: 'Pit', trap: true },
    'not-a-highlight',
  ],
  turnOrder: [
    { id: 'te_1', label: 'Goblin', initiative: 18, characterId: 'char_1', tokenId: 't1', delay: true },
    { id: 'te_2', label: 'Orc', initiative: -1 },
  ],
  drawings: [
    { id: 'd1', color: '#ffffff', points: [{ x: 0, y: 0 }, { x: 1.5, y: 2, pressure: 0.2 }, 'bad-point'], width: 3 },
    { id: 'd2', color: '#000', points: { bad: true } },
  ],
  texts: [{ id: 'tx1', x: 8, y: 9, text: 'Runes', color: '#fbbf24', font: 'serif' }, 9],
  pins: [
    { id: 'p1', x: 2, y: 2, label: 'Door', wikiArticleId: 'wiki_1', wikiArticle: { id: 'wiki_1', title: 'Door' } },
    { label: 5, x: 'a' },
  ],
  encounters: [
    {
      id: 'enc1',
      name: 'Ambush',
      note: 'from the east',
      tokens: [{ id: 'et1', label: 'Wolf', color: '#888', x: 0, y: 0, size: 1, conditions: [] }],
    },
    { id: 'enc2', name: 'Broken', tokens: 'nope' },
    'bare',
  ],
  snapshots: [
    {
      id: 'snap1',
      name: 'Before',
      createdAt: 1_700_000_000_123,
      owner: 'dm',
      state: {
        gridWidth: 30,
        gridHeight: 20,
        tokens: [{ id: 'st1', label: 'Goblin', color: '#ff0000', x: 3, y: 4, size: 1, conditions: ['Prone'] }],
        highlights: [],
        fog: ['4,4'],
        backgroundImage: null,
        turnOrder: [],
        activeId: 'te_1',
        feetPerSquare: 5,
        cellNumbers: true,
        handout: null,
        drawings: [],
        texts: [],
        pins: [],
        scratch: 'keep me',
      },
    },
    { id: 'snap2', name: 'Empty state', createdAt: 5, state: null },
    { id: 'snap3', name: 'Bad state', createdAt: 'yesterday', state: ['nope'] },
  ],
};

roundTrip(full);
roundTrip({});
roundTrip({ gridWidth: 20, gridHeight: 20, tokens: [], highlights: [], fog: [] });
roundTrip({
  backgroundImage: null,
  activeId: null,
  handout: null,
  cellNumbers: false,
  tokens: [],
  fog: [],
  encounters: [],
  snapshots: [],
});

const partial = stateToDocument({ tokens: [{ id: 'only' }] });
assert.equal(partial.ok, true);
if (partial.ok) {
  const back = documentToState(partial.document);
  assert.deepEqual(Object.keys(back), ['tokens']);
  assert.equal('hp' in (back.tokens as Record<string, unknown>[])[0], false);
  assert.equal(partial.document.board.presentKeys.includes('fog'), false);
}

assert.equal(stateToDocument(null).ok, false);
assert.equal(stateToDocument([]).ok, false);
assert.equal(stateToDocument('map').ok, false);
assert.equal(stateToDocument(3).ok, false);

const legacy = { gridWidth: 12, tokens: [{ id: 'legacy' }] };
const fromTables = stateToDocument({ gridWidth: 8, tokens: [{ id: 'table', x: 1 }] });
assert.equal(fromTables.ok, true);
if (!fromTables.ok) throw new Error('unreachable');

assert.deepEqual(resolveBattleRead({ document: null, legacy }), { source: 'legacy', malformedLegacy: false, state: legacy });
assert.deepEqual(resolveBattleRead({ document: null, legacy: null }), { source: 'empty', malformedLegacy: false, state: {} });
assert.deepEqual(resolveBattleRead({ document: null, legacy: undefined }), { source: 'empty', malformedLegacy: false, state: {} });
for (const bad of [[], 'nope', 1, true]) {
  const read = resolveBattleRead({ document: null, legacy: bad });
  assert.equal(read.source, 'empty');
  assert.equal(read.malformedLegacy, true);
  assert.deepEqual(read.state, {});
}
const preferred = resolveBattleRead({ document: fromTables.document, legacy });
assert.equal(preferred.source, 'tables');
assert.deepEqual(preferred.state, { gridWidth: 8, tokens: [{ id: 'table', x: 1 }] });
assert.equal(preferred.malformedLegacy, false);
const tablesDespiteGarbage = resolveBattleRead({ document: fromTables.document, legacy: ['bad'] });
assert.equal(tablesDespiteGarbage.source, 'tables');
assert.equal(tablesDespiteGarbage.malformedLegacy, true);
assert.deepEqual(tablesDespiteGarbage.state.gridWidth, 8);

const previous = process.env.BATTLE_MAP_DUAL_WRITE;
try {
  delete process.env.BATTLE_MAP_DUAL_WRITE;
  assert.equal(dualWriteLegacyBattleJson(), true);
  for (const off of ['0', 'false', 'off', 'no', ' FALSE ']) {
    process.env.BATTLE_MAP_DUAL_WRITE = off;
    assert.equal(dualWriteLegacyBattleJson(), false, off);
  }
  process.env.BATTLE_MAP_DUAL_WRITE = '1';
  assert.equal(dualWriteLegacyBattleJson(), true);
} finally {
  if (previous === undefined) delete process.env.BATTLE_MAP_DUAL_WRITE;
  else process.env.BATTLE_MAP_DUAL_WRITE = previous;
}

// Huge map: max-size fog grid, a few thousand tokens, long strokes, many snapshots.
const fog: string[] = [];
for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) fog.push(`${x},${y}`);
for (let i = 0; i < 2000; i++) fog.push(`${i % 40},${Math.floor(i / 40) % 40}`);
const tokens = Array.from({ length: 1500 }, (_, i) => ({
  id: `t_${i}`,
  label: `Token ${i}`,
  color: '#abc',
  x: i % 40,
  y: Math.floor(i / 40) % 40,
  size: i % 5 === 0 ? 0.5 : 2,
  hidden: i % 17 === 0,
  hp: i,
  maxHp: 100,
  conditions: i % 3 === 0 ? ['Prone', 'Bleeding'] : [],
  extraNote: { i },
}));
const drawings = Array.from({ length: 40 }, (_, d) => ({
  id: `d_${d}`,
  color: '#fff',
  points: Array.from({ length: 250 }, (_, p) => ({ x: p / 10, y: d, n: p })),
}));
const snapshots = Array.from({ length: 8 }, (_, s) => ({
  id: `s_${s}`,
  name: `Snap ${s}`,
  createdAt: 1_700_000_000_000 + s,
  state: {
    gridWidth: 40,
    gridHeight: 40,
    fog: fog.slice(0, 100),
    tokens: tokens.slice(0, 25).map((token) => ({ ...token, id: `${token.id}_s${s}` })),
    highlights: [],
    drawings: drawings.slice(0, 2),
    texts: [],
    pins: [],
    turnOrder: [],
    backgroundImage: null,
    activeId: null,
    feetPerSquare: 5,
    cellNumbers: true,
    handout: null,
  },
}));
const huge = {
  gridWidth: 40,
  gridHeight: 40,
  fog,
  tokens,
  drawings,
  snapshots,
  encounters: [{ id: 'e', name: 'Horde', tokens: tokens.slice(0, 100) }],
  highlights: [],
  texts: [],
  pins: [],
  turnOrder: [],
};
const hugeEncoded = stateToDocument(huge);
assert.equal(hugeEncoded.ok, true);
if (!hugeEncoded.ok) throw new Error('unreachable');
assert.equal(countsMatch(huge, hugeEncoded.document), true);
const hugeBack = documentToState(hugeEncoded.document);
assert.equal((hugeBack.fog as unknown[]).length, fog.length);
assert.equal((hugeBack.tokens as { id: string }[])[1499].id, 't_1499');
assert.deepEqual((hugeBack.tokens as { extraNote: unknown }[])[10].extraNote, { i: 10 });
assert.equal(countDocument(hugeEncoded.document).points, 40 * 250 + 8 * 2 * 250);
assert.deepEqual(hugeBack, huge);

// The codec stress fixture stays under the production caps. A write of it is legal.
assert.equal(battleMapWriteRejection(huge), null);
assert.equal(BATTLE_MAP_LIMITS.maxBytes, 8 * 1024 * 1024);
assert.equal(BATTLE_MAP_LIMITS.tokens, 10_000);
assert.equal(BATTLE_MAP_LIMITS.conditionsPerToken, 64);
assert.equal(BATTLE_MAP_LIMITS.drawings, 4_000);
assert.equal(BATTLE_MAP_LIMITS.pointsPerDrawing, 2_000);
assert.equal(BATTLE_MAP_LIMITS.fogCells, 100_000);
assert.equal(BATTLE_MAP_LIMITS.texts, 2_000);
assert.equal(BATTLE_MAP_LIMITS.pins, 2_000);
assert.equal(BATTLE_MAP_LIMITS.highlights, 2_000);
assert.equal(BATTLE_MAP_LIMITS.turns, 10_000);
assert.equal(BATTLE_MAP_LIMITS.encounters, 200);
assert.equal(BATTLE_MAP_LIMITS.snapshots, 50);

const tight: BattleMapLimits = {
  ...BATTLE_MAP_LIMITS,
  maxBytes: 80,
  tokens: 2,
  conditionsPerToken: 2,
  drawings: 1,
  pointsPerDrawing: 2,
  fogCells: 2,
  texts: 1,
  pins: 1,
  highlights: 1,
  turns: 1,
  encounters: 1,
  snapshots: 1,
};
const play = {
  gridWidth: 20,
  tokens: [{ id: 'hero', conditions: ['Prone'] }],
  fog: ['1,1'],
  drawings: [{ id: 'd', points: [{ x: 0, y: 0 }] }],
  texts: [{ id: 'tx', text: 'A' }],
  pins: [{ id: 'p' }],
  highlights: [{ id: 'h' }],
  turnOrder: [{ id: 'te' }],
  encounters: [{ id: 'e', tokens: [{ id: 'et' }] }],
  snapshots: [{ id: 's', state: { tokens: [{ id: 'st' }], fog: ['2,2'] } }],
};
assert.equal(battleMapWriteRejection(play, { ...tight, maxBytes: 10_000, tokens: 5, fogCells: 5 }), null);

const overRows = battleMapWriteRejection({
  tokens: [
    { id: 'a', conditions: ['Prone', 'Shaken', 'Dead'] },
    { id: 'b' },
    { id: 'c' },
  ],
  fog: ['0,0', '1,1', '2,2'],
  drawings: [{ id: 'd1', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }, { id: 'd2', points: [] }],
  texts: [{ id: 't1' }, { id: 't2' }],
  pins: [{ id: 'p1' }, { id: 'p2' }],
  highlights: [{ id: 'h1' }, { id: 'h2' }],
  turnOrder: [{ id: 'te1' }, { id: 'te2' }],
  encounters: [{ id: 'e1', tokens: [{ id: 'et' }] }, { id: 'e2' }],
  snapshots: [{ id: 's1', state: { tokens: [{ id: 'st', conditions: ['x', 'y', 'z'] }], fog: ['9,9'] } }, { id: 's2' }],
}, { ...tight, maxBytes: 100_000 });
assert.ok(overRows);
assert.equal(overRows.status, 400);
assert.match(overRows.error, /exceeds row limits/);
const names = overRows.violations.map((v) => v.limit);
for (const name of ['tokens', 'conditionsPerToken', 'fogCells', 'drawings', 'pointsPerDrawing', 'texts', 'pins', 'highlights', 'turns', 'encounters', 'snapshots'] as const) {
  assert.ok(names.includes(name), name);
}
const tokenCount = overRows.violations.find((v) => v.limit === 'tokens');
assert.equal(tokenCount?.actual, 5); // 3 live + 1 encounter + 1 snapshot
assert.equal(tokenCount?.max, 2);
const cond = overRows.violations.filter((v) => v.limit === 'conditionsPerToken');
assert.deepEqual(cond.map((v) => v.detail).sort(), ['a', 'st']);
assert.equal(battleMapLimitViolations({}, tight).length, 0);

const fat = { notes: 'x'.repeat(200) };
const overBytes = battleMapWriteRejection(fat, tight);
assert.ok(overBytes);
assert.equal(overBytes.status, 413);
assert.match(overBytes.error, /over the 80 byte limit/);
assert.equal(overBytes.violations[0].limit, 'maxBytes');
// Row violations are not mixed into a byte rejection, and nothing is clipped.
assert.equal(overBytes.violations.length, 1);
assert.equal((fat.notes as string).length, 200);

assert.equal(battleMapContentLengthRejection(null), null);
assert.equal(battleMapContentLengthRejection(''), null);
assert.equal(battleMapContentLengthRejection(String(BATTLE_MAP_LIMITS.maxRequestBytes)), null);
assert.match(battleMapContentLengthRejection(String(BATTLE_MAP_LIMITS.maxRequestBytes + 1)) ?? '', /request is/);

function documentOf(state: Record<string, unknown>) {
  const encoded = stateToDocument(state);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) throw new Error('unreachable');
  return encoded.document;
}

function targeted(prev: Record<string, unknown>, next: Record<string, unknown>) {
  const plan = planBattleWrite(documentOf(prev), documentOf(next));
  assert.equal(plan.kind, 'targeted', plan.kind === 'replace' ? plan.reason : '');
  if (plan.kind !== 'targeted') throw new Error('unreachable');
  const applied = applyTargetedPlan(documentOf(prev), plan);
  assert.deepEqual(documentToState(applied), next);
  // The JSON column stores this full next document in the same transaction.
  assert.deepEqual(battleMapLegacyPayload(next), next);
  return plan;
}

const party = {
  gridWidth: 20,
  fog: ['1,1', '2,2'],
  tokens: [
    { id: 'pc', label: 'Kara', x: 1, y: 1, color: '#fff', size: 1, characterId: 'c1' },
    { id: 'npc', label: 'Goblin', x: 4, y: 4, color: '#f00', size: 1, conditions: ['Prone'] },
  ],
  turnOrder: [
    { id: 'te_pc', label: 'Kara', initiative: 12, tokenId: 'pc', characterId: 'c1' },
    { id: 'te_npc', label: 'Goblin', initiative: 8, tokenId: 'npc' },
  ],
  activeId: 'te_pc',
  encounters: [{
    id: 'enc', name: 'Ambush',
    tokens: [
      { id: 'epc', label: 'Kara', x: 0, y: 0, color: '#fff', size: 1, characterId: 'c1' },
      { id: 'enpc', label: 'Wolf', x: 3, y: 3, color: '#888', size: 1 },
    ],
  }],
  snapshots: [{
    id: 'snap', name: 'Before', createdAt: 10,
    state: {
      fog: ['1,1', '2,2'],
      tokens: [
        { id: 'spc', label: 'Kara', x: 1, y: 1, color: '#fff', size: 1, characterId: 'c1' },
        { id: 'snpc', label: 'Goblin', x: 4, y: 4, color: '#f00', size: 1 },
      ],
      turnOrder: [{ id: 'ste', label: 'Kara', initiative: 12, tokenId: 'spc', characterId: 'c1' }],
      activeId: 'ste',
    },
  }],
};

const moved = {
  ...party,
  tokens: party.tokens.map((token) => (token.id === 'npc' ? { ...token, x: 5 } : token)),
};
const move = targeted(party, moved);
assert.equal(move.tokens.length, 1);
assert.equal(move.turns.length, 0);
assert.equal(move.mapActiveId, null);
assert.deepEqual(move.snapshotActiveIds, []);
assert.deepEqual(move.tokens[0], {
  ...move.tokens[0],
  op: 'update',
  clientId: 'npc',
  changed: ['x'],
  parent: { scope: 'map' },
});

const conditioned = {
  ...party,
  tokens: party.tokens.map((token) => (token.id === 'npc' ? { ...token, conditions: ['Prone', 'Shaken'] } : token)),
};
const conditions = targeted(party, conditioned);
assert.equal(conditions.tokens.length, 1);
assert.equal(conditions.tokens[0].op, 'update');
if (conditions.tokens[0].op === 'update') assert.deepEqual(conditions.tokens[0].changed, ['conditions']);
assert.equal(conditions.turns.length, 0);

const added = {
  ...party,
  tokens: [...party.tokens, { id: 'new', label: 'Orc', x: 6, y: 6, color: '#0f0', size: 2 }],
};
const addition = targeted(party, added);
assert.equal(addition.tokens.length, 1);
assert.equal(addition.tokens[0].op, 'insert');
if (addition.tokens[0].op === 'insert') assert.equal(addition.tokens[0].token.clientId, 'new');
assert.equal(addition.turns.length, 0);

const removed = { ...party, tokens: party.tokens.filter((token) => token.id !== 'npc') };
const removal = targeted(party, removed);
assert.deepEqual(removal.tokens.map((op) => op.op === 'delete' ? op.clientId : op.op), ['npc']);
assert.equal(removal.turns.length, 0);

const stripped = removeCharacterTokens(party, 'c1');
const strip = targeted(party, stripped);
assert.deepEqual(
  strip.tokens.map((op) => `${op.op}:${op.op === 'insert' ? op.token.clientId : op.clientId}`).sort(),
  ['delete:epc', 'delete:pc', 'delete:spc'],
);
assert.deepEqual(
  strip.turns.map((op) => `${op.op}:${op.op === 'insert' ? op.turn.clientId : op.clientId}`).sort(),
  ['delete:ste', 'delete:te_pc'],
);
assert.deepEqual(strip.mapActiveId, { from: 'te_pc', to: null });
assert.deepEqual(strip.snapshotActiveIds, [{ clientId: 'snap', from: 'ste', to: null }]);
assert.equal(JSON.stringify(strip).includes('npc'), false);
assert.equal(JSON.stringify(strip).includes('enpc'), false);
assert.equal(JSON.stringify(strip).includes('snpc'), false);
assert.deepEqual(battleMapLegacyPayload(stripped), stripped);

const fogged = planBattleWrite(documentOf(party), documentOf({ ...party, fog: [] }));
assert.equal(fogged.kind, 'replace');
const restored = planBattleWrite(documentOf(party), documentOf({
  ...party,
  tokens: [],
  fog: [],
  turnOrder: [],
  activeId: null,
}));
assert.equal(restored.kind, 'replace');
assert.equal(planBattleWrite(null, documentOf(party)).kind, 'replace');

console.log('test-battle-map-tables: ok');

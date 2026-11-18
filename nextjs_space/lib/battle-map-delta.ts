// Decide whether a battle-map save can touch individual rows or must replace
// the whole document. A single token move, condition edit, add, or remove,
// and a character strip, only list those tokens (and the turn rows that
// belong to them). Fog, drawings, snapshots-as-boards, encounter list
// changes, and anything else stay on the full-replace path.
//
// The legacy JSON column still receives the full next document. Applying a
// targeted plan to the previous document must reproduce that same document,
// so the tables and the JSON stay in lockstep.

import {
  decodeBoard,
  decodeEncounter,
  decodeSnapshot,
  isPlainObject,
  type BattleDocument,
  type Board,
  type EncounterRow,
  type JsonObject,
  type SnapshotRow,
  type TokenRow,
  type TurnRow,
} from '@/lib/battle-map-codec';

export type TokenParent =
  | { scope: 'map' }
  | { scope: 'encounter'; clientId: string }
  | { scope: 'snapshot'; clientId: string };

export type TurnParent =
  | { scope: 'map' }
  | { scope: 'snapshot'; clientId: string };

export type TokenOp =
  | { op: 'insert'; parent: TokenParent; token: TokenRow }
  | { op: 'delete'; parent: TokenParent; clientId: string }
  | { op: 'update'; parent: TokenParent; clientId: string; token: TokenRow; changed: string[] };

export type TurnOp =
  | { op: 'insert'; parent: TurnParent; turn: TurnRow }
  | { op: 'delete'; parent: TurnParent; clientId: string }
  | { op: 'update'; parent: TurnParent; clientId: string; turn: TurnRow; changed: string[] };

export type ActiveIdPatch = { from: string | null; to: string | null };

export type TargetedBattleWrite = {
  kind: 'targeted';
  tokens: TokenOp[];
  turns: TurnOp[];
  mapActiveId: ActiveIdPatch | null;
  snapshotActiveIds: Array<{ clientId: string } & ActiveIdPatch>;
};

export type BattleWritePlan =
  | { kind: 'replace'; reason: string }
  | TargetedBattleWrite;

const TOKEN_FIELDS = [
  'sort', 'label', 'color', 'x', 'y', 'size', 'hidden', 'characterId', 'characterName',
  'portraitKey', 'hp', 'maxHp', 'creatureId',
] as const;

const TURN_FIELDS = ['sort', 'label', 'initiative', 'characterId', 'tokenId'] as const;

function canon(value: unknown): string {
  return JSON.stringify(order(value));
}

function order(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(order);
  if (!isPlainObject(value)) return value;
  const out: JsonObject = {};
  for (const key of Object.keys(value).sort()) out[key] = order(value[key]);
  return out;
}

function without(source: JsonObject, keys: string[]): JsonObject {
  const out: JsonObject = {};
  for (const key of Object.keys(source)) {
    if (!keys.includes(key)) out[key] = source[key];
  }
  return out;
}

function boardShell(board: Board): string {
  const decoded = decodeBoard(board);
  return canon(without(decoded, ['tokens', 'turnOrder', 'activeId']));
}

function encounterShell(row: EncounterRow): string {
  if (row.passthrough) return canon({ passthrough: row.raw });
  const decoded = decodeEncounter(row);
  if (!isPlainObject(decoded)) return canon(decoded);
  return canon(without(decoded, ['tokens']));
}

function snapshotShell(row: SnapshotRow): string {
  if (row.passthrough) return canon({ passthrough: row.raw });
  const decoded = decodeSnapshot(row);
  if (!isPlainObject(decoded)) return canon(decoded);
  const rest = without(decoded, ['state']);
  const state = decoded.state;
  if (isPlainObject(state)) rest.state = without(state, ['tokens', 'turnOrder', 'activeId']);
  else rest.state = state;
  return canon(rest);
}

function sameIdSet(prev: string[], next: string[]): boolean {
  if (prev.length !== next.length) return false;
  const have = new Set(prev);
  return next.every((id) => have.has(id));
}

function indexRows<T extends { clientId: string | null; passthrough: boolean }>(
  rows: T[],
  label: string,
): { ok: true; byId: Map<string, T> } | { ok: false; reason: string } {
  const byId = new Map<string, T>();
  for (const row of rows) {
    if (row.passthrough || !row.clientId) return { ok: false, reason: `${label} has no stable id` };
    if (byId.has(row.clientId)) return { ok: false, reason: `${label} id ${row.clientId} is duplicated` };
    byId.set(row.clientId, row);
  }
  return { ok: true, byId };
}

function tokenChanges(prev: TokenRow, next: TokenRow): string[] {
  const changed: string[] = [];
  for (const key of TOKEN_FIELDS) {
    if (prev[key] !== next[key]) changed.push(key);
  }
  if (canon(prev.conditions) !== canon(next.conditions)) changed.push('conditions');
  if (canon(prev.presentKeys) !== canon(next.presentKeys)) changed.push('presentKeys');
  if (canon(prev.extra) !== canon(next.extra)) changed.push('extra');
  if (prev.passthrough !== next.passthrough || canon(prev.raw) !== canon(next.raw)) changed.push('raw');
  return changed;
}

function turnChanges(prev: TurnRow, next: TurnRow): string[] {
  const changed: string[] = [];
  for (const key of TURN_FIELDS) {
    if (prev[key] !== next[key]) changed.push(key);
  }
  if (canon(prev.presentKeys) !== canon(next.presentKeys)) changed.push('presentKeys');
  if (canon(prev.extra) !== canon(next.extra)) changed.push('extra');
  if (prev.passthrough !== next.passthrough || canon(prev.raw) !== canon(next.raw)) changed.push('raw');
  return changed;
}

function diffTokens(prev: TokenRow[], next: TokenRow[], parent: TokenParent, label: string): TokenOp[] | { replace: string } {
  const a = indexRows(prev, label);
  if (!a.ok) return { replace: a.reason };
  const b = indexRows(next, label);
  if (!b.ok) return { replace: b.reason };
  const ops: TokenOp[] = [];
  for (const [id] of a.byId) {
    if (!b.byId.has(id)) ops.push({ op: 'delete', parent, clientId: id });
  }
  for (const [id, token] of b.byId) {
    const before = a.byId.get(id);
    if (!before) ops.push({ op: 'insert', parent, token });
    else {
      const changed = tokenChanges(before, token);
      // Array index is stored as sort. Deleting a neighbor shifts later indexes
      // but the remaining sort values already keep order, so a sort-only change
      // must not rewrite that other token.
      if (changed.some((key) => key !== 'sort')) ops.push({ op: 'update', parent, clientId: id, token, changed });
    }
  }
  return ops;
}

function diffTurns(prev: TurnRow[], next: TurnRow[], parent: TurnParent, label: string): TurnOp[] | { replace: string } {
  const a = indexRows(prev, label);
  if (!a.ok) return { replace: a.reason };
  const b = indexRows(next, label);
  if (!b.ok) return { replace: b.reason };
  const ops: TurnOp[] = [];
  for (const [id] of a.byId) {
    if (!b.byId.has(id)) ops.push({ op: 'delete', parent, clientId: id });
  }
  for (const [id, turn] of b.byId) {
    const before = a.byId.get(id);
    if (!before) ops.push({ op: 'insert', parent, turn });
    else {
      const changed = turnChanges(before, turn);
      if (changed.some((key) => key !== 'sort')) ops.push({ op: 'update', parent, clientId: id, turn, changed });
    }
  }
  return ops;
}

function replace(reason: string): BattleWritePlan {
  return { kind: 'replace', reason };
}

/**
 * The JSON column is always the full next document, whether the tables were
 * replaced or only a few rows changed.
 */
export function battleMapLegacyPayload(next: JsonObject): JsonObject {
  return next;
}

export function planBattleWrite(prev: BattleDocument | null, next: BattleDocument): BattleWritePlan {
  if (!prev) return replace('no existing map');
  if (boardShell(prev.board) !== boardShell(next.board)) return replace('board changed beyond tokens and turns');

  const prevEnc = indexRows(prev.encounters, 'encounter');
  if (!prevEnc.ok) return replace(prevEnc.reason);
  const nextEnc = indexRows(next.encounters, 'encounter');
  if (!nextEnc.ok) return replace(nextEnc.reason);
  if (!sameIdSet([...prevEnc.byId.keys()], [...nextEnc.byId.keys()])) return replace('encounter list changed');
  for (const [id, row] of prevEnc.byId) {
    const other = nextEnc.byId.get(id);
    if (!other || encounterShell(row) !== encounterShell(other)) return replace(`encounter ${id} changed beyond its tokens`);
  }

  const prevSnap = indexRows(prev.snapshots, 'snapshot');
  if (!prevSnap.ok) return replace(prevSnap.reason);
  const nextSnap = indexRows(next.snapshots, 'snapshot');
  if (!nextSnap.ok) return replace(nextSnap.reason);
  if (!sameIdSet([...prevSnap.byId.keys()], [...nextSnap.byId.keys()])) return replace('snapshot list changed');
  for (const [id, row] of prevSnap.byId) {
    const other = nextSnap.byId.get(id);
    if (!other || snapshotShell(row) !== snapshotShell(other)) return replace(`snapshot ${id} changed beyond its tokens and turns`);
  }

  const tokens: TokenOp[] = [];
  const turns: TurnOp[] = [];
  const liveTokens = diffTokens(prev.board.tokens, next.board.tokens, { scope: 'map' }, 'token');
  if (!Array.isArray(liveTokens)) return replace(liveTokens.replace);
  tokens.push(...liveTokens);
  const liveTurns = diffTurns(prev.board.turns, next.board.turns, { scope: 'map' }, 'turn');
  if (!Array.isArray(liveTurns)) return replace(liveTurns.replace);
  turns.push(...liveTurns);

  for (const [id, row] of prevEnc.byId) {
    const other = nextEnc.byId.get(id)!;
    const ops = diffTokens(row.tokens, other.tokens, { scope: 'encounter', clientId: id }, `encounter ${id} token`);
    if (!Array.isArray(ops)) return replace(ops.replace);
    tokens.push(...ops);
  }
  const snapshotActiveIds: TargetedBattleWrite['snapshotActiveIds'] = [];
  for (const [id, row] of prevSnap.byId) {
    const other = nextSnap.byId.get(id)!;
    const prevBoard = row.board;
    const nextBoard = other.board;
    if (!prevBoard || !nextBoard) {
      if (prevBoard !== nextBoard) return replace(`snapshot ${id} state shape changed`);
      continue;
    }
    const ops = diffTokens(prevBoard.tokens, nextBoard.tokens, { scope: 'snapshot', clientId: id }, `snapshot ${id} token`);
    if (!Array.isArray(ops)) return replace(ops.replace);
    tokens.push(...ops);
    const turnOps = diffTurns(prevBoard.turns, nextBoard.turns, { scope: 'snapshot', clientId: id }, `snapshot ${id} turn`);
    if (!Array.isArray(turnOps)) return replace(turnOps.replace);
    turns.push(...turnOps);
    if (prevBoard.activeId !== nextBoard.activeId) {
      snapshotActiveIds.push({ clientId: id, from: prevBoard.activeId, to: nextBoard.activeId });
    }
  }

  return {
    kind: 'targeted',
    tokens,
    turns,
    mapActiveId: prev.board.activeId === next.board.activeId ? null : { from: prev.board.activeId, to: next.board.activeId },
    snapshotActiveIds,
  };
}

function listFor(doc: BattleDocument, parent: TokenParent): TokenRow[] | null {
  if (parent.scope === 'map') return doc.board.tokens;
  if (parent.scope === 'encounter') {
    const encounter = doc.encounters.find((row) => row.clientId === parent.clientId);
    return encounter ? encounter.tokens : null;
  }
  const snapshot = doc.snapshots.find((row) => row.clientId === parent.clientId);
  return snapshot?.board ? snapshot.board.tokens : null;
}

function turnsFor(doc: BattleDocument, parent: TurnParent): TurnRow[] | null {
  if (parent.scope === 'map') return doc.board.turns;
  const snapshot = doc.snapshots.find((row) => row.clientId === parent.clientId);
  return snapshot?.board ? snapshot.board.turns : null;
}

function bySort<T extends { sort: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort - b.sort);
}

/** Apply a targeted plan in memory. Used to prove the plan reproduces the next document. */
export function applyTargetedPlan(prev: BattleDocument, plan: TargetedBattleWrite): BattleDocument {
  const doc = structuredClone(prev) as BattleDocument;
  for (const op of plan.tokens) {
    const list = listFor(doc, op.parent);
    if (!list) throw new Error(`missing parent for token ${op.op}`);
    if (op.op === 'delete') {
      const index = list.findIndex((row) => row.clientId === op.clientId);
      if (index < 0) throw new Error(`missing token ${op.clientId}`);
      list.splice(index, 1);
    } else if (op.op === 'insert') {
      list.push(structuredClone(op.token));
    } else {
      const index = list.findIndex((row) => row.clientId === op.clientId);
      if (index < 0) throw new Error(`missing token ${op.clientId}`);
      list[index] = structuredClone(op.token);
    }
  }
  for (const list of tokenLists(doc)) list.splice(0, list.length, ...bySort(list));
  for (const op of plan.turns) {
    const list = turnsFor(doc, op.parent);
    if (!list) throw new Error(`missing parent for turn ${op.op}`);
    if (op.op === 'delete') {
      const index = list.findIndex((row) => row.clientId === op.clientId);
      if (index < 0) throw new Error(`missing turn ${op.clientId}`);
      list.splice(index, 1);
    } else if (op.op === 'insert') {
      list.push(structuredClone(op.turn));
    } else {
      const index = list.findIndex((row) => row.clientId === op.clientId);
      if (index < 0) throw new Error(`missing turn ${op.clientId}`);
      list[index] = structuredClone(op.turn);
    }
  }
  for (const list of turnLists(doc)) list.splice(0, list.length, ...bySort(list));
  if (plan.mapActiveId) doc.board.activeId = plan.mapActiveId.to;
  for (const patch of plan.snapshotActiveIds) {
    const snapshot = doc.snapshots.find((row) => row.clientId === patch.clientId);
    if (!snapshot?.board) throw new Error(`missing snapshot ${patch.clientId}`);
    snapshot.board.activeId = patch.to;
  }
  return doc;
}

function tokenLists(doc: BattleDocument): TokenRow[][] {
  return [
    doc.board.tokens,
    ...doc.encounters.map((row) => row.tokens),
    ...doc.snapshots.flatMap((row) => (row.board ? [row.board.tokens] : [])),
  ];
}

function turnLists(doc: BattleDocument): TurnRow[][] {
  return [
    doc.board.turns,
    ...doc.snapshots.flatMap((row) => (row.board ? [row.board.turns] : [])),
  ];
}

// Database access for the relational battle map.
//
// Reads: BattleMap rows when the campaign has been backfilled (or written by
// this code); otherwise Campaign.battleMapState. Writes always go to the
// tables. The legacy JSON column is updated in the same transaction while
// dual-write is on (the default) so reverting the app is safe.

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { removeCharacterTokens } from '@/lib/battle-map';
import {
  dualWriteLegacyBattleJson,
  isPlainObject,
  resolveBattleRead,
  stateToDocument,
  type BattleDocument,
  type Board,
  type DrawingRow,
  type EncounterRow,
  type FogCell,
  type HighlightRow,
  type JsonObject,
  type PinRow,
  type PointRow,
  type SnapshotRow,
  type TextRow,
  type TokenRow,
  type TurnRow,
} from '@/lib/battle-map-codec';

export type BattleDb = PrismaClient | Prisma.TransactionClient;

export type LoadedBattle = {
  version: number;
  source: 'tables' | 'legacy' | 'empty';
  malformedLegacy: boolean;
  state: JsonObject;
};

export type SaveBattleResult =
  | { ok: true; version: number }
  | { ok: false; status: 404 }
  | { ok: false; status: 409; version: number }
  | { ok: false; status: 400; error: string };

const CHUNK = 250;

const tokenInclude = {
  orderBy: { sort: 'asc' as const },
  include: { conditions: { orderBy: { sort: 'asc' as const } } },
};

const boardInclude = {
  tokens: tokenInclude,
  highlights: { orderBy: { sort: 'asc' as const } },
  fogCells: { orderBy: { sort: 'asc' as const } },
  turns: { orderBy: { sort: 'asc' as const } },
  drawings: { orderBy: { sort: 'asc' as const }, include: { points: { orderBy: { sort: 'asc' as const } } } },
  texts: { orderBy: { sort: 'asc' as const } },
  pins: { orderBy: { sort: 'asc' as const } },
};

const battleInclude = {
  ...boardInclude,
  encounters: { orderBy: { sort: 'asc' as const }, include: { tokens: tokenInclude } },
  snapshots: { orderBy: { sort: 'asc' as const }, include: boardInclude },
} satisfies Prisma.BattleMapInclude;

type BattleMapRow = Prisma.BattleMapGetPayload<{ include: typeof battleInclude }>;
type TokenRecord = BattleMapRow['tokens'][number];
type HighlightRecord = BattleMapRow['highlights'][number];
type FogRecord = BattleMapRow['fogCells'][number];
type TurnRecord = BattleMapRow['turns'][number];
type DrawingRecord = BattleMapRow['drawings'][number];
type TextRecord = BattleMapRow['texts'][number];
type PinRecord = BattleMapRow['pins'][number];

export function isMissingBattleSchema(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const message = String((err as { message?: string }).message ?? '');
  if (code === 'P2021' || code === 'P2022') return true;
  if (code === 'P2010' && (message.includes('42P01') || message.includes('does not exist'))) return true;
  return message.includes('does not exist') && (message.includes('BattleMap') || message.includes('BattleToken'));
}

function asExtra(value: unknown): JsonObject {
  return isPlainObject(value) ? value : {};
}

function jsonValue(value: JsonObject): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function rawColumn(passthrough: boolean, raw: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull | typeof Prisma.JsonNull {
  if (!passthrough) return Prisma.DbNull;
  if (raw === null) return Prisma.JsonNull;
  if (typeof raw === 'undefined') return Prisma.DbNull;
  return raw as Prisma.InputJsonValue;
}

async function createMany<T>(delegate: { createMany: (args: { data: T[] }) => Promise<unknown> }, rows: T[]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const data = rows.slice(i, i + CHUNK);
    if (data.length > 0) await delegate.createMany({ data });
  }
}

function tokenFrom(row: TokenRecord): TokenRow {
  const conditions = [...row.conditions].sort((a, b) => a.sort - b.sort).map((condition) => condition.value);
  return {
    sort: row.sort,
    passthrough: row.passthrough,
    raw: row.passthrough ? row.raw : null,
    presentKeys: row.presentKeys,
    extra: asExtra(row.extra),
    clientId: row.clientId,
    label: row.label,
    color: row.color,
    x: row.x,
    y: row.y,
    size: row.size,
    hidden: row.hidden,
    characterId: row.characterId,
    characterName: row.characterName,
    portraitKey: row.portraitKey,
    hp: row.hp,
    maxHp: row.maxHp,
    creatureId: row.creatureId,
    conditions,
  };
}

function highlightFrom(row: HighlightRecord): HighlightRow {
  return {
    sort: row.sort, passthrough: row.passthrough, raw: row.passthrough ? row.raw : null,
    presentKeys: row.presentKeys, extra: asExtra(row.extra), clientId: row.clientId,
    x: row.x, y: row.y, w: row.w, h: row.h, color: row.color, label: row.label,
  };
}

function fogFrom(row: FogRecord): FogCell {
  return { sort: row.sort, passthrough: row.passthrough, raw: row.passthrough ? row.raw : null, x: row.x, y: row.y };
}

function turnFrom(row: TurnRecord): TurnRow {
  return {
    sort: row.sort, passthrough: row.passthrough, raw: row.passthrough ? row.raw : null,
    presentKeys: row.presentKeys, extra: asExtra(row.extra), clientId: row.clientId,
    label: row.label, initiative: row.initiative, characterId: row.characterId, tokenId: row.tokenId,
  };
}

function pointFrom(row: DrawingRecord['points'][number]): PointRow {
  return {
    sort: row.sort, passthrough: row.passthrough, raw: row.passthrough ? row.raw : null,
    presentKeys: row.presentKeys, extra: asExtra(row.extra), x: row.x, y: row.y,
  };
}

function drawingFrom(row: DrawingRecord): DrawingRow {
  return {
    sort: row.sort, passthrough: row.passthrough, raw: row.passthrough ? row.raw : null,
    presentKeys: row.presentKeys, extra: asExtra(row.extra), clientId: row.clientId,
    color: row.color, pointsPresent: row.pointsPresent,
    points: [...row.points].sort((a, b) => a.sort - b.sort).map(pointFrom),
  };
}

function textFrom(row: TextRecord): TextRow {
  return {
    sort: row.sort, passthrough: row.passthrough, raw: row.passthrough ? row.raw : null,
    presentKeys: row.presentKeys, extra: asExtra(row.extra), clientId: row.clientId,
    x: row.x, y: row.y, text: row.text, color: row.color,
  };
}

function pinFrom(row: PinRecord): PinRow {
  return {
    sort: row.sort, passthrough: row.passthrough, raw: row.passthrough ? row.raw : null,
    presentKeys: row.presentKeys, extra: asExtra(row.extra), clientId: row.clientId,
    x: row.x, y: row.y, label: row.label, wikiArticleId: row.wikiArticleId,
  };
}

function boardFrom(
  scalars: {
    presentKeys: string[];
    extra: unknown;
    gridWidth: number | null;
    gridHeight: number | null;
    backgroundImage: string | null;
    feetPerSquare: number | null;
    cellNumbers: boolean | null;
    activeId: string | null;
    handoutNull: boolean;
    handoutKey: string | null;
    handoutPushedAt: number | null;
    handoutKeys: string[];
    handoutExtra: unknown;
  },
  children: {
    tokens: TokenRecord[];
    highlights: HighlightRecord[];
    fogCells: FogRecord[];
    turns: TurnRecord[];
    drawings: DrawingRecord[];
    texts: TextRecord[];
    pins: PinRecord[];
  },
): Board {
  const sort = <T extends { sort: number }>(rows: T[]) => [...rows].sort((a, b) => a.sort - b.sort);
  return {
    presentKeys: scalars.presentKeys,
    extra: asExtra(scalars.extra),
    gridWidth: scalars.gridWidth,
    gridHeight: scalars.gridHeight,
    backgroundImage: scalars.backgroundImage,
    feetPerSquare: scalars.feetPerSquare,
    cellNumbers: scalars.cellNumbers,
    activeId: scalars.activeId,
    handoutNull: scalars.handoutNull,
    handoutKey: scalars.handoutKey,
    handoutPushedAt: scalars.handoutPushedAt,
    handoutKeys: scalars.handoutKeys,
    handoutExtra: asExtra(scalars.handoutExtra),
    tokens: sort(children.tokens).map(tokenFrom),
    highlights: sort(children.highlights).map(highlightFrom),
    fog: sort(children.fogCells).map(fogFrom),
    turns: sort(children.turns).map(turnFrom),
    drawings: sort(children.drawings).map(drawingFrom),
    texts: sort(children.texts).map(textFrom),
    pins: sort(children.pins).map(pinFrom),
  };
}

export function mapRecordToDocument(map: BattleMapRow): BattleDocument {
  const board = boardFrom(map, map);
  const encounters: EncounterRow[] = [...map.encounters].sort((a, b) => a.sort - b.sort).map((encounter) => ({
    sort: encounter.sort,
    passthrough: encounter.passthrough,
    raw: encounter.passthrough ? encounter.raw : null,
    presentKeys: encounter.presentKeys,
    extra: asExtra(encounter.extra),
    clientId: encounter.clientId,
    name: encounter.name,
    tokensPresent: encounter.tokensPresent,
    tokens: [...encounter.tokens].sort((a, b) => a.sort - b.sort).map(tokenFrom),
  }));
  const snapshots: SnapshotRow[] = [...map.snapshots].sort((a, b) => a.sort - b.sort).map((snapshot) => ({
    sort: snapshot.sort,
    passthrough: snapshot.passthrough,
    raw: snapshot.passthrough ? snapshot.raw : null,
    presentKeys: snapshot.presentKeys,
    extra: asExtra(snapshot.extra),
    clientId: snapshot.clientId,
    name: snapshot.name,
    createdAtMs: snapshot.createdAtMs,
    stateNull: snapshot.stateNull,
    board: snapshot.passthrough || snapshot.stateNull || !snapshot.presentKeys.includes('state')
      ? null
      : boardFrom(
        {
          presentKeys: snapshot.stateKeys,
          extra: snapshot.stateExtra,
          gridWidth: snapshot.gridWidth,
          gridHeight: snapshot.gridHeight,
          backgroundImage: snapshot.backgroundImage,
          feetPerSquare: snapshot.feetPerSquare,
          cellNumbers: snapshot.cellNumbers,
          activeId: snapshot.activeId,
          handoutNull: snapshot.handoutNull,
          handoutKey: snapshot.handoutKey,
          handoutPushedAt: snapshot.handoutPushedAt,
          handoutKeys: snapshot.handoutKeys,
          handoutExtra: snapshot.handoutExtra,
        },
        snapshot,
      ),
  }));
  return { board, encounters, snapshots };
}

export async function loadBattleState(db: BattleDb, campaignId: string): Promise<LoadedBattle | null> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    select: { battleMapVersion: true, battleMapState: true },
  });
  if (!campaign) return null;
  let document: BattleDocument | null = null;
  try {
    const map = await db.battleMap.findUnique({ where: { campaignId }, include: battleInclude });
    if (map) document = mapRecordToDocument(map);
  } catch (err) {
    if (!isMissingBattleSchema(err)) throw err;
  }
  const resolved = resolveBattleRead({ document, legacy: campaign.battleMapState });
  return { version: campaign.battleMapVersion, ...resolved };
}

type QueuedToken = { row: Prisma.BattleTokenCreateManyInput; conditions: string[] };

function queueToken(
  tokens: QueuedToken[],
  row: TokenRow,
  parent: { battleMapId?: string; encounterId?: string; snapshotId?: string },
) {
  const id = randomUUID();
  const keepConditions = !row.passthrough && row.presentKeys.includes('conditions');
  tokens.push({
    conditions: keepConditions ? row.conditions : [],
    row: {
      id,
      battleMapId: parent.battleMapId ?? null,
      encounterId: parent.encounterId ?? null,
      snapshotId: parent.snapshotId ?? null,
      sort: row.sort,
      passthrough: row.passthrough,
      raw: rawColumn(row.passthrough, row.raw),
      presentKeys: row.presentKeys,
      extra: jsonValue(row.extra),
      clientId: row.clientId,
      label: row.label,
      color: row.color,
      x: row.x,
      y: row.y,
      size: row.size,
      hidden: row.hidden,
      characterId: row.characterId,
      characterName: row.characterName,
      portraitKey: row.portraitKey,
      hp: row.hp,
      maxHp: row.maxHp,
      creatureId: row.creatureId,
    },
  });
}

function queueBoardChildren(
  board: Board,
  parent: { battleMapId?: string; snapshotId?: string },
  bags: InsertBags,
) {
  for (const row of board.tokens) queueToken(bags.tokens, row, parent);
  for (const row of board.highlights) bags.highlights.push(highlightInsert(row, parent));
  for (const row of board.fog) bags.fog.push(fogInsert(row, parent));
  for (const row of board.turns) bags.turns.push(turnInsert(row, parent));
  for (const row of board.texts) bags.texts.push(textInsert(row, parent));
  for (const row of board.pins) bags.pins.push(pinInsert(row, parent));
  for (const row of board.drawings) {
    const id = randomUUID();
    bags.drawings.push(drawingInsert(id, row, parent));
    if (row.pointsPresent) {
      for (const point of row.points) bags.points.push(pointInsert(id, point));
    }
  }
}

type InsertBags = {
  tokens: QueuedToken[];
  highlights: Prisma.BattleHighlightCreateManyInput[];
  fog: Prisma.BattleFogCellCreateManyInput[];
  turns: Prisma.BattleTurnCreateManyInput[];
  texts: Prisma.BattleTextCreateManyInput[];
  pins: Prisma.BattlePinCreateManyInput[];
  drawings: Prisma.BattleDrawingCreateManyInput[];
  points: Prisma.BattleDrawingPointCreateManyInput[];
};

function highlightInsert(row: HighlightRow, parent: { battleMapId?: string; snapshotId?: string }): Prisma.BattleHighlightCreateManyInput {
  return {
    id: randomUUID(), battleMapId: parent.battleMapId ?? null, snapshotId: parent.snapshotId ?? null,
    sort: row.sort, passthrough: row.passthrough, raw: rawColumn(row.passthrough, row.raw),
    presentKeys: row.presentKeys, extra: jsonValue(row.extra), clientId: row.clientId,
    x: row.x, y: row.y, w: row.w, h: row.h, color: row.color, label: row.label,
  };
}

function fogInsert(row: FogCell, parent: { battleMapId?: string; snapshotId?: string }): Prisma.BattleFogCellCreateManyInput {
  return {
    id: randomUUID(), battleMapId: parent.battleMapId ?? null, snapshotId: parent.snapshotId ?? null,
    sort: row.sort, passthrough: row.passthrough, raw: rawColumn(row.passthrough, row.raw), x: row.x, y: row.y,
  };
}

function turnInsert(row: TurnRow, parent: { battleMapId?: string; snapshotId?: string }): Prisma.BattleTurnCreateManyInput {
  return {
    id: randomUUID(), battleMapId: parent.battleMapId ?? null, snapshotId: parent.snapshotId ?? null,
    sort: row.sort, passthrough: row.passthrough, raw: rawColumn(row.passthrough, row.raw),
    presentKeys: row.presentKeys, extra: jsonValue(row.extra), clientId: row.clientId,
    label: row.label, initiative: row.initiative, characterId: row.characterId, tokenId: row.tokenId,
  };
}

function textInsert(row: TextRow, parent: { battleMapId?: string; snapshotId?: string }): Prisma.BattleTextCreateManyInput {
  return {
    id: randomUUID(), battleMapId: parent.battleMapId ?? null, snapshotId: parent.snapshotId ?? null,
    sort: row.sort, passthrough: row.passthrough, raw: rawColumn(row.passthrough, row.raw),
    presentKeys: row.presentKeys, extra: jsonValue(row.extra), clientId: row.clientId,
    x: row.x, y: row.y, text: row.text, color: row.color,
  };
}

function pinInsert(row: PinRow, parent: { battleMapId?: string; snapshotId?: string }): Prisma.BattlePinCreateManyInput {
  return {
    id: randomUUID(), battleMapId: parent.battleMapId ?? null, snapshotId: parent.snapshotId ?? null,
    sort: row.sort, passthrough: row.passthrough, raw: rawColumn(row.passthrough, row.raw),
    presentKeys: row.presentKeys, extra: jsonValue(row.extra), clientId: row.clientId,
    x: row.x, y: row.y, label: row.label, wikiArticleId: row.wikiArticleId,
  };
}

function drawingInsert(id: string, row: DrawingRow, parent: { battleMapId?: string; snapshotId?: string }): Prisma.BattleDrawingCreateManyInput {
  return {
    id, battleMapId: parent.battleMapId ?? null, snapshotId: parent.snapshotId ?? null,
    sort: row.sort, passthrough: row.passthrough, raw: rawColumn(row.passthrough, row.raw),
    presentKeys: row.presentKeys, extra: jsonValue(row.extra), clientId: row.clientId,
    color: row.color, pointsPresent: row.pointsPresent,
  };
}

function pointInsert(drawingId: string, row: PointRow): Prisma.BattleDrawingPointCreateManyInput {
  return {
    id: randomUUID(), drawingId, sort: row.sort, passthrough: row.passthrough,
    raw: rawColumn(row.passthrough, row.raw), presentKeys: row.presentKeys, extra: jsonValue(row.extra),
    x: row.x, y: row.y,
  };
}

function boardScalarData(board: Board) {
  return {
    gridWidth: board.gridWidth,
    gridHeight: board.gridHeight,
    backgroundImage: board.backgroundImage,
    feetPerSquare: board.feetPerSquare,
    cellNumbers: board.cellNumbers,
    activeId: board.activeId,
    handoutKey: board.handoutKey,
    handoutPushedAt: board.handoutPushedAt,
    handoutNull: board.handoutNull,
    handoutKeys: board.handoutKeys,
    handoutExtra: jsonValue(board.handoutExtra),
  };
}

/** Replace every relational row for one campaign. Caller holds the transaction. */
export async function replaceBattleDocument(tx: Prisma.TransactionClient, campaignId: string, document: BattleDocument): Promise<void> {
  await tx.battleMap.deleteMany({ where: { campaignId } });
  const mapId = randomUUID();
  const board = document.board;
  await tx.battleMap.create({
    data: {
      id: mapId,
      campaignId,
      ...boardScalarData(board),
      presentKeys: board.presentKeys,
      extra: jsonValue(board.extra),
    },
  });

  const encounterIds = new Map<number, string>();
  if (document.encounters.length > 0) {
    await createMany(tx.battleEncounter, document.encounters.map((encounter) => {
      const id = randomUUID();
      encounterIds.set(encounter.sort, id);
      return {
        id,
        battleMapId: mapId,
        sort: encounter.sort,
        passthrough: encounter.passthrough,
        raw: rawColumn(encounter.passthrough, encounter.raw),
        presentKeys: encounter.presentKeys,
        extra: jsonValue(encounter.extra),
        clientId: encounter.clientId,
        name: encounter.name,
        tokensPresent: encounter.tokensPresent,
      };
    }));
  }

  const snapshotIds = new Map<number, string>();
  if (document.snapshots.length > 0) {
    await createMany(tx.battleSnapshot, document.snapshots.map((snapshot) => {
      const id = randomUUID();
      snapshotIds.set(snapshot.sort, id);
      const nested = snapshot.board;
      return {
        id,
        battleMapId: mapId,
        sort: snapshot.sort,
        passthrough: snapshot.passthrough,
        raw: rawColumn(snapshot.passthrough, snapshot.raw),
        presentKeys: snapshot.presentKeys,
        extra: jsonValue(snapshot.extra),
        clientId: snapshot.clientId,
        name: snapshot.name,
        createdAtMs: snapshot.createdAtMs,
        stateNull: snapshot.stateNull,
        stateKeys: nested?.presentKeys ?? [],
        stateExtra: jsonValue(nested?.extra ?? {}),
        gridWidth: nested?.gridWidth ?? null,
        gridHeight: nested?.gridHeight ?? null,
        backgroundImage: nested?.backgroundImage ?? null,
        feetPerSquare: nested?.feetPerSquare ?? null,
        cellNumbers: nested?.cellNumbers ?? null,
        activeId: nested?.activeId ?? null,
        handoutKey: nested?.handoutKey ?? null,
        handoutPushedAt: nested?.handoutPushedAt ?? null,
        handoutNull: nested?.handoutNull ?? false,
        handoutKeys: nested?.handoutKeys ?? [],
        handoutExtra: jsonValue(nested?.handoutExtra ?? {}),
      };
    }));
  }

  const bags: InsertBags = { tokens: [], highlights: [], fog: [], turns: [], texts: [], pins: [], drawings: [], points: [] };
  queueBoardChildren(board, { battleMapId: mapId }, bags);
  for (const encounter of document.encounters) {
    if (!encounter.tokensPresent) continue;
    const encounterId = encounterIds.get(encounter.sort);
    if (!encounterId) continue;
    for (const token of encounter.tokens) queueToken(bags.tokens, token, { encounterId });
  }
  for (const snapshot of document.snapshots) {
    if (!snapshot.board) continue;
    const snapshotId = snapshotIds.get(snapshot.sort);
    if (!snapshotId) continue;
    queueBoardChildren(snapshot.board, { snapshotId }, bags);
  }

  await createMany(tx.battleToken, bags.tokens.map((token) => token.row));
  const conditions: Prisma.BattleTokenConditionCreateManyInput[] = [];
  for (const token of bags.tokens) {
    const tokenId = token.row.id;
    if (!tokenId) continue;
    token.conditions.forEach((value, sort) => {
      conditions.push({ id: randomUUID(), tokenId, sort, value });
    });
  }
  await createMany(tx.battleTokenCondition, conditions);
  await createMany(tx.battleHighlight, bags.highlights);
  await createMany(tx.battleFogCell, bags.fog);
  await createMany(tx.battleTurn, bags.turns);
  await createMany(tx.battleText, bags.texts);
  await createMany(tx.battlePin, bags.pins);
  await createMany(tx.battleDrawing, bags.drawings);
  await createMany(tx.battleDrawingPoint, bags.points);
}

async function tablesReady(tx: Prisma.TransactionClient, campaignId: string): Promise<boolean> {
  try {
    await tx.battleMap.findUnique({ where: { campaignId }, select: { id: true } });
    return true;
  } catch (err) {
    if (!isMissingBattleSchema(err)) throw err;
    return false;
  }
}

/**
 * Lock the campaign row, optionally enforce optimistic concurrency, replace
 * the relational document, bump battleMapVersion, and dual-write legacy JSON
 * unless BATTLE_MAP_DUAL_WRITE is off. When the tables are not migrated yet,
 * the write stays on the JSON column so the map keeps working.
 */
export async function saveBattleStateTx(
  tx: Prisma.TransactionClient,
  campaignId: string,
  state: JsonObject,
  opts: { expectedVersion: number | null },
): Promise<SaveBattleResult> {
  await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
  const current = await tx.campaign.findUnique({
    where: { id: campaignId },
    select: { battleMapVersion: true },
  });
  if (!current) return { ok: false, status: 404 };
  if (opts.expectedVersion !== null && current.battleMapVersion !== opts.expectedVersion) {
    return { ok: false, status: 409, version: current.battleMapVersion };
  }
  const encoded = stateToDocument(state);
  if (!encoded.ok) return { ok: false, status: 400, error: encoded.reason };

  const ready = await tablesReady(tx, campaignId);
  if (ready) await replaceBattleDocument(tx, campaignId, encoded.document);

  const dualWrite = !ready || dualWriteLegacyBattleJson();
  const updated = await tx.campaign.update({
    where: { id: campaignId },
    data: {
      battleMapVersion: { increment: 1 },
      ...(dualWrite ? { battleMapState: state as Prisma.InputJsonValue } : {}),
    },
    select: { battleMapVersion: true },
  });
  return { ok: true, version: updated.battleMapVersion };
}

export async function saveBattleState(
  db: BattleDb,
  campaignId: string,
  state: JsonObject,
  opts: { expectedVersion: number | null },
): Promise<SaveBattleResult> {
  const client = db as PrismaClient;
  if (typeof client.$transaction === 'function') {
    return client.$transaction((tx) => saveBattleStateTx(tx, campaignId, state, opts), { timeout: 60_000, maxWait: 10_000 });
  }
  return saveBattleStateTx(db as Prisma.TransactionClient, campaignId, state, opts);
}

/** Drop one or more characters' tokens from the live map, encounters, and snapshots. */
export async function stripCharactersFromBattleMap(
  tx: Prisma.TransactionClient,
  campaignId: string,
  characterIds: string[],
): Promise<void> {
  const loaded = await loadBattleState(tx, campaignId);
  if (!loaded || loaded.source === 'empty') return;
  let state: Record<string, any> = loaded.state;
  for (const characterId of characterIds) state = removeCharacterTokens(state, characterId);
  const saved = await saveBattleStateTx(tx, campaignId, state, { expectedVersion: null });
  if (!saved.ok && saved.status !== 404) {
    throw new Error(saved.status === 400 ? saved.error : 'Failed to update the battle map');
  }
}

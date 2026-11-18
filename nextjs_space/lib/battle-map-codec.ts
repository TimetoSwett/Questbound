// Pure battle-map JSON ↔ relational rows codec.
//
// Known fields become columns and child rows. Every other key is kept on an
// `extra` object, and `presentKeys` records which known keys were actually in
// the source so missing keys stay missing (they are not filled with defaults).
// Array elements that are not objects are stored whole (`passthrough` + `raw`)
// so a malformed-but-parseable document still round-trips.
//
// No database and no Prisma. Persistence lives in lib/battle-map-store.ts.

export type JsonObject = Record<string, unknown>;

export type FogCell = {
  sort: number;
  passthrough: boolean;
  raw: unknown;
  x: number | null;
  y: number | null;
};

export type TokenRow = {
  sort: number;
  passthrough: boolean;
  raw: unknown;
  presentKeys: string[];
  extra: JsonObject;
  clientId: string | null;
  label: string | null;
  color: string | null;
  x: number | null;
  y: number | null;
  size: number | null;
  hidden: boolean | null;
  characterId: string | null;
  characterName: string | null;
  portraitKey: string | null;
  hp: number | null;
  maxHp: number | null;
  creatureId: string | null;
  conditions: string[];
};

export type HighlightRow = {
  sort: number;
  passthrough: boolean;
  raw: unknown;
  presentKeys: string[];
  extra: JsonObject;
  clientId: string | null;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  color: string | null;
  label: string | null;
};

export type TurnRow = {
  sort: number;
  passthrough: boolean;
  raw: unknown;
  presentKeys: string[];
  extra: JsonObject;
  clientId: string | null;
  label: string | null;
  initiative: number | null;
  characterId: string | null;
  tokenId: string | null;
};

export type PointRow = {
  sort: number;
  passthrough: boolean;
  raw: unknown;
  presentKeys: string[];
  extra: JsonObject;
  x: number | null;
  y: number | null;
};

export type DrawingRow = {
  sort: number;
  passthrough: boolean;
  raw: unknown;
  presentKeys: string[];
  extra: JsonObject;
  clientId: string | null;
  color: string | null;
  pointsPresent: boolean;
  points: PointRow[];
};

export type TextRow = {
  sort: number;
  passthrough: boolean;
  raw: unknown;
  presentKeys: string[];
  extra: JsonObject;
  clientId: string | null;
  x: number | null;
  y: number | null;
  text: string | null;
  color: string | null;
};

export type PinRow = {
  sort: number;
  passthrough: boolean;
  raw: unknown;
  presentKeys: string[];
  extra: JsonObject;
  clientId: string | null;
  x: number | null;
  y: number | null;
  label: string | null;
  wikiArticleId: string | null;
};

/** Scalars + collections that exist on the live board and inside a snapshot. */
export type Board = {
  presentKeys: string[];
  extra: JsonObject;
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
  handoutExtra: JsonObject;
  fog: FogCell[];
  tokens: TokenRow[];
  highlights: HighlightRow[];
  turns: TurnRow[];
  drawings: DrawingRow[];
  texts: TextRow[];
  pins: PinRow[];
};

export type EncounterRow = {
  sort: number;
  passthrough: boolean;
  raw: unknown;
  presentKeys: string[];
  extra: JsonObject;
  clientId: string | null;
  name: string | null;
  tokensPresent: boolean;
  tokens: TokenRow[];
};

export type SnapshotRow = {
  sort: number;
  passthrough: boolean;
  raw: unknown;
  presentKeys: string[];
  extra: JsonObject;
  clientId: string | null;
  name: string | null;
  createdAtMs: number | null;
  stateNull: boolean;
  board: Board | null;
};

export type BattleDocument = {
  board: Board;
  encounters: EncounterRow[];
  snapshots: SnapshotRow[];
};

export type EncodeResult =
  | { ok: true; document: BattleDocument }
  | { ok: false; reason: string };

export type BattleCounts = {
  tokens: number;
  conditions: number;
  highlights: number;
  fog: number;
  turns: number;
  drawings: number;
  points: number;
  texts: number;
  pins: number;
  encounters: number;
  snapshots: number;
};

const BOARD_SCALARS = new Set(['gridWidth', 'gridHeight', 'backgroundImage', 'feetPerSquare', 'cellNumbers', 'activeId']);
const BOARD_ARRAYS = new Set(['tokens', 'highlights', 'fog', 'turnOrder', 'drawings', 'texts', 'pins']);
const NULLABLE_STRING_SCALARS = new Set(['backgroundImage', 'activeId']);
const NUMBER_SCALARS = new Set(['gridWidth', 'gridHeight', 'feetPerSquare']);

const TOKEN_STRINGS = ['id', 'label', 'color', 'characterId', 'characterName', 'portraitKey', 'creatureId'] as const;
const TOKEN_NUMBERS = ['x', 'y', 'size', 'hp', 'maxHp'] as const;
const HIGHLIGHT_NUMBERS = ['x', 'y', 'w', 'h'] as const;
const HIGHLIGHT_STRINGS = ['id', 'color', 'label'] as const;

export function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPgInt(value: number): boolean {
  return Number.isSafeInteger(value) && value >= -2147483648 && value <= 2147483647;
}

/** Copy enumerable own keys without invoking the `__proto__` setter. */
function assignOwn(target: JsonObject, source: JsonObject): JsonObject {
  for (const key of Object.keys(source)) {
    Object.defineProperty(target, key, {
      value: source[key],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return target;
}

function cloneExtra(extra: JsonObject): JsonObject {
  return assignOwn({}, extra);
}

function emptyBoard(): Board {
  return {
    presentKeys: [],
    extra: {},
    gridWidth: null,
    gridHeight: null,
    backgroundImage: null,
    feetPerSquare: null,
    cellNumbers: null,
    activeId: null,
    handoutNull: false,
    handoutKey: null,
    handoutPushedAt: null,
    handoutKeys: [],
    handoutExtra: {},
    fog: [],
    tokens: [],
    highlights: [],
    turns: [],
    drawings: [],
    texts: [],
    pins: [],
  };
}

function emptyCounts(): BattleCounts {
  return {
    tokens: 0,
    conditions: 0,
    highlights: 0,
    fog: 0,
    turns: 0,
    drawings: 0,
    points: 0,
    texts: 0,
    pins: 0,
    encounters: 0,
    snapshots: 0,
  };
}

function encodeFog(value: unknown, sort: number): FogCell {
  if (typeof value === 'string') {
    const match = /^(-?\d+),(-?\d+)$/.exec(value);
    if (match) {
      const x = Number(match[1]);
      const y = Number(match[2]);
      if (String(x) === match[1] && String(y) === match[2] && isPgInt(x) && isPgInt(y)) {
        return { sort, passthrough: false, raw: null, x, y };
      }
    }
  }
  return { sort, passthrough: true, raw: value, x: null, y: null };
}

function decodeFog(cell: FogCell): unknown {
  if (cell.passthrough) return cell.raw;
  return `${cell.x},${cell.y}`;
}

function takeString(source: JsonObject, key: string, extra: JsonObject, present: string[]): string | null {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return null;
  const value = source[key];
  if (typeof value === 'string') {
    present.push(key);
    return value;
  }
  extra[key] = value;
  return null;
}

function takeNumber(source: JsonObject, key: string, extra: JsonObject, present: string[]): number | null {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return null;
  const value = source[key];
  if (isJsonNumber(value)) {
    present.push(key);
    return value;
  }
  extra[key] = value;
  return null;
}

function takeBoolean(source: JsonObject, key: string, extra: JsonObject, present: string[]): boolean | null {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return null;
  const value = source[key];
  if (typeof value === 'boolean') {
    present.push(key);
    return value;
  }
  extra[key] = value;
  return null;
}

function leftover(source: JsonObject, known: Set<string>): JsonObject {
  const extra: JsonObject = {};
  for (const key of Object.keys(source)) {
    if (!known.has(key)) extra[key] = source[key];
  }
  return extra;
}

const TOKEN_KNOWN = new Set<string>([...TOKEN_STRINGS, ...TOKEN_NUMBERS, 'hidden', 'conditions']);

function encodeToken(value: unknown, sort: number): TokenRow {
  const base: TokenRow = {
    sort,
    passthrough: true,
    raw: value,
    presentKeys: [],
    extra: {},
    clientId: null,
    label: null,
    color: null,
    x: null,
    y: null,
    size: null,
    hidden: null,
    characterId: null,
    characterName: null,
    portraitKey: null,
    hp: null,
    maxHp: null,
    creatureId: null,
    conditions: [],
  };
  if (!isPlainObject(value)) return base;
  const extra = leftover(value, TOKEN_KNOWN);
  const present: string[] = [];
  const row: TokenRow = {
    ...base,
    passthrough: false,
    raw: null,
    extra,
    clientId: takeString(value, 'id', extra, present),
    label: takeString(value, 'label', extra, present),
    color: takeString(value, 'color', extra, present),
    characterId: takeString(value, 'characterId', extra, present),
    characterName: takeString(value, 'characterName', extra, present),
    portraitKey: takeString(value, 'portraitKey', extra, present),
    creatureId: takeString(value, 'creatureId', extra, present),
    x: takeNumber(value, 'x', extra, present),
    y: takeNumber(value, 'y', extra, present),
    size: takeNumber(value, 'size', extra, present),
    hp: takeNumber(value, 'hp', extra, present),
    maxHp: takeNumber(value, 'maxHp', extra, present),
    hidden: takeBoolean(value, 'hidden', extra, present),
  };
  if (Object.prototype.hasOwnProperty.call(value, 'conditions')) {
    const conditions = value.conditions;
    if (Array.isArray(conditions) && conditions.every((item) => typeof item === 'string')) {
      present.push('conditions');
      row.conditions = conditions.slice();
    } else {
      extra.conditions = conditions;
    }
  }
  row.presentKeys = present;
  row.extra = extra;
  return row;
}

function decodeToken(row: TokenRow): unknown {
  if (row.passthrough) return row.raw;
  const out = cloneExtra(row.extra);
  const columns: Record<string, unknown> = {
    id: row.clientId,
    label: row.label,
    color: row.color,
    characterId: row.characterId,
    characterName: row.characterName,
    portraitKey: row.portraitKey,
    creatureId: row.creatureId,
    x: row.x,
    y: row.y,
    size: row.size,
    hp: row.hp,
    maxHp: row.maxHp,
    hidden: row.hidden,
    conditions: row.conditions.slice(),
  };
  for (const key of row.presentKeys) assignOwn(out, { [key]: columns[key] });
  return out;
}

function encodeHighlight(value: unknown, sort: number): HighlightRow {
  const base: HighlightRow = {
    sort, passthrough: true, raw: value, presentKeys: [], extra: {},
    clientId: null, x: null, y: null, w: null, h: null, color: null, label: null,
  };
  if (!isPlainObject(value)) return base;
  const known = new Set<string>([...HIGHLIGHT_STRINGS, ...HIGHLIGHT_NUMBERS]);
  const extra = leftover(value, known);
  const present: string[] = [];
  return {
    ...base,
    passthrough: false,
    raw: null,
    extra,
    presentKeys: present,
    clientId: takeString(value, 'id', extra, present),
    color: takeString(value, 'color', extra, present),
    label: takeString(value, 'label', extra, present),
    x: takeNumber(value, 'x', extra, present),
    y: takeNumber(value, 'y', extra, present),
    w: takeNumber(value, 'w', extra, present),
    h: takeNumber(value, 'h', extra, present),
  };
}

function decodeHighlight(row: HighlightRow): unknown {
  if (row.passthrough) return row.raw;
  const out = cloneExtra(row.extra);
  const columns: Record<string, unknown> = {
    id: row.clientId, color: row.color, label: row.label, x: row.x, y: row.y, w: row.w, h: row.h,
  };
  for (const key of row.presentKeys) assignOwn(out, { [key]: columns[key] });
  return out;
}

const TURN_KNOWN = new Set(['id', 'label', 'initiative', 'characterId', 'tokenId']);

function encodeTurn(value: unknown, sort: number): TurnRow {
  const base: TurnRow = {
    sort, passthrough: true, raw: value, presentKeys: [], extra: {},
    clientId: null, label: null, initiative: null, characterId: null, tokenId: null,
  };
  if (!isPlainObject(value)) return base;
  const extra = leftover(value, TURN_KNOWN);
  const present: string[] = [];
  return {
    ...base,
    passthrough: false,
    raw: null,
    extra,
    presentKeys: present,
    clientId: takeString(value, 'id', extra, present),
    label: takeString(value, 'label', extra, present),
    characterId: takeString(value, 'characterId', extra, present),
    tokenId: takeString(value, 'tokenId', extra, present),
    initiative: takeNumber(value, 'initiative', extra, present),
  };
}

function decodeTurn(row: TurnRow): unknown {
  if (row.passthrough) return row.raw;
  const out = cloneExtra(row.extra);
  const columns: Record<string, unknown> = {
    id: row.clientId, label: row.label, initiative: row.initiative, characterId: row.characterId, tokenId: row.tokenId,
  };
  for (const key of row.presentKeys) assignOwn(out, { [key]: columns[key] });
  return out;
}

function encodePoint(value: unknown, sort: number): PointRow {
  const base: PointRow = { sort, passthrough: true, raw: value, presentKeys: [], extra: {}, x: null, y: null };
  if (!isPlainObject(value)) return base;
  const extra = leftover(value, new Set(['x', 'y']));
  const present: string[] = [];
  return {
    ...base,
    passthrough: false,
    raw: null,
    extra,
    presentKeys: present,
    x: takeNumber(value, 'x', extra, present),
    y: takeNumber(value, 'y', extra, present),
  };
}

function decodePoint(row: PointRow): unknown {
  if (row.passthrough) return row.raw;
  const out = cloneExtra(row.extra);
  const columns: Record<string, unknown> = { x: row.x, y: row.y };
  for (const key of row.presentKeys) assignOwn(out, { [key]: columns[key] });
  return out;
}

const DRAWING_KNOWN = new Set(['id', 'color', 'points']);

function encodeDrawing(value: unknown, sort: number): DrawingRow {
  const base: DrawingRow = {
    sort, passthrough: true, raw: value, presentKeys: [], extra: {},
    clientId: null, color: null, pointsPresent: false, points: [],
  };
  if (!isPlainObject(value)) return base;
  const extra = leftover(value, DRAWING_KNOWN);
  const present: string[] = [];
  const row: DrawingRow = {
    ...base,
    passthrough: false,
    raw: null,
    extra,
    presentKeys: present,
    clientId: takeString(value, 'id', extra, present),
    color: takeString(value, 'color', extra, present),
  };
  if (Object.prototype.hasOwnProperty.call(value, 'points')) {
    if (Array.isArray(value.points)) {
      present.push('points');
      row.pointsPresent = true;
      row.points = value.points.map((point, index) => encodePoint(point, index));
    } else {
      extra.points = value.points;
    }
  }
  row.extra = extra;
  return row;
}

function decodeDrawing(row: DrawingRow): unknown {
  if (row.passthrough) return row.raw;
  const out = cloneExtra(row.extra);
  const columns: Record<string, unknown> = {
    id: row.clientId,
    color: row.color,
    points: row.points.map(decodePoint),
  };
  for (const key of row.presentKeys) assignOwn(out, { [key]: columns[key] });
  return out;
}

const TEXT_KNOWN = new Set(['id', 'x', 'y', 'text', 'color']);

function encodeText(value: unknown, sort: number): TextRow {
  const base: TextRow = {
    sort, passthrough: true, raw: value, presentKeys: [], extra: {},
    clientId: null, x: null, y: null, text: null, color: null,
  };
  if (!isPlainObject(value)) return base;
  const extra = leftover(value, TEXT_KNOWN);
  const present: string[] = [];
  return {
    ...base,
    passthrough: false,
    raw: null,
    extra,
    presentKeys: present,
    clientId: takeString(value, 'id', extra, present),
    text: takeString(value, 'text', extra, present),
    color: takeString(value, 'color', extra, present),
    x: takeNumber(value, 'x', extra, present),
    y: takeNumber(value, 'y', extra, present),
  };
}

function decodeText(row: TextRow): unknown {
  if (row.passthrough) return row.raw;
  const out = cloneExtra(row.extra);
  const columns: Record<string, unknown> = { id: row.clientId, text: row.text, color: row.color, x: row.x, y: row.y };
  for (const key of row.presentKeys) assignOwn(out, { [key]: columns[key] });
  return out;
}

const PIN_KNOWN = new Set(['id', 'x', 'y', 'label', 'wikiArticleId']);

function encodePin(value: unknown, sort: number): PinRow {
  const base: PinRow = {
    sort, passthrough: true, raw: value, presentKeys: [], extra: {},
    clientId: null, x: null, y: null, label: null, wikiArticleId: null,
  };
  if (!isPlainObject(value)) return base;
  const extra = leftover(value, PIN_KNOWN);
  const present: string[] = [];
  return {
    ...base,
    passthrough: false,
    raw: null,
    extra,
    presentKeys: present,
    clientId: takeString(value, 'id', extra, present),
    label: takeString(value, 'label', extra, present),
    wikiArticleId: takeString(value, 'wikiArticleId', extra, present),
    x: takeNumber(value, 'x', extra, present),
    y: takeNumber(value, 'y', extra, present),
  };
}

function decodePin(row: PinRow): unknown {
  if (row.passthrough) return row.raw;
  const out = cloneExtra(row.extra);
  const columns: Record<string, unknown> = {
    id: row.clientId, label: row.label, wikiArticleId: row.wikiArticleId, x: row.x, y: row.y,
  };
  for (const key of row.presentKeys) assignOwn(out, { [key]: columns[key] });
  return out;
}

function encodeHandoutObject(value: JsonObject): Pick<Board, 'handoutKey' | 'handoutPushedAt' | 'handoutKeys' | 'handoutExtra'> {
  const known = new Set(['key', 'pushedAt']);
  const extra = leftover(value, known);
  const keys: string[] = [];
  return {
    handoutKey: takeString(value, 'key', extra, keys),
    handoutPushedAt: takeNumber(value, 'pushedAt', extra, keys),
    handoutKeys: keys,
    handoutExtra: extra,
  };
}

function decodeHandout(board: Board): unknown {
  if (board.handoutNull) return null;
  const out = cloneExtra(board.handoutExtra);
  const columns: Record<string, unknown> = { key: board.handoutKey, pushedAt: board.handoutPushedAt };
  for (const key of board.handoutKeys) assignOwn(out, { [key]: columns[key] });
  return out;
}

export function encodeBoard(source: JsonObject): Board {
  const board = emptyBoard();
  const extra: JsonObject = {};
  const present: string[] = [];
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (key === 'handout') {
      if (value === null) {
        present.push(key);
        board.handoutNull = true;
        continue;
      }
      if (!isPlainObject(value)) {
        extra[key] = value;
        continue;
      }
      present.push(key);
      Object.assign(board, encodeHandoutObject(value));
      continue;
    }
    if (BOARD_ARRAYS.has(key)) {
      if (!Array.isArray(value)) {
        extra[key] = value;
        continue;
      }
      present.push(key);
      if (key === 'fog') board.fog = value.map(encodeFog);
      else if (key === 'tokens') board.tokens = value.map(encodeToken);
      else if (key === 'highlights') board.highlights = value.map(encodeHighlight);
      else if (key === 'turnOrder') board.turns = value.map(encodeTurn);
      else if (key === 'drawings') board.drawings = value.map(encodeDrawing);
      else if (key === 'texts') board.texts = value.map(encodeText);
      else if (key === 'pins') board.pins = value.map(encodePin);
      continue;
    }
    if (!BOARD_SCALARS.has(key)) {
      extra[key] = value;
      continue;
    }
    if (NULLABLE_STRING_SCALARS.has(key)) {
      if (typeof value === 'string' || value === null) {
        present.push(key);
        if (key === 'backgroundImage') board.backgroundImage = value;
        else board.activeId = value;
      } else extra[key] = value;
      continue;
    }
    if (NUMBER_SCALARS.has(key)) {
      if (isJsonNumber(value)) {
        present.push(key);
        if (key === 'gridWidth') board.gridWidth = value;
        else if (key === 'gridHeight') board.gridHeight = value;
        else board.feetPerSquare = value;
      } else extra[key] = value;
      continue;
    }
    if (key === 'cellNumbers') {
      if (typeof value === 'boolean') {
        present.push(key);
        board.cellNumbers = value;
      } else extra[key] = value;
    }
  }
  board.presentKeys = present;
  board.extra = extra;
  return board;
}

export function decodeBoard(board: Board): JsonObject {
  const out = cloneExtra(board.extra);
  const columns: Record<string, unknown> = {
    gridWidth: board.gridWidth,
    gridHeight: board.gridHeight,
    backgroundImage: board.backgroundImage,
    feetPerSquare: board.feetPerSquare,
    cellNumbers: board.cellNumbers,
    activeId: board.activeId,
    handout: decodeHandout(board),
    fog: board.fog.map(decodeFog),
    tokens: board.tokens.map(decodeToken),
    highlights: board.highlights.map(decodeHighlight),
    turnOrder: board.turns.map(decodeTurn),
    drawings: board.drawings.map(decodeDrawing),
    texts: board.texts.map(decodeText),
    pins: board.pins.map(decodePin),
  };
  for (const key of board.presentKeys) {
    if (key === 'encounters' || key === 'snapshots') continue;
    if (Object.prototype.hasOwnProperty.call(columns, key)) assignOwn(out, { [key]: columns[key] });
  }
  return out;
}

const ENCOUNTER_KNOWN = new Set(['id', 'name', 'tokens']);

function encodeEncounter(value: unknown, sort: number): EncounterRow {
  const base: EncounterRow = {
    sort, passthrough: true, raw: value, presentKeys: [], extra: {},
    clientId: null, name: null, tokensPresent: false, tokens: [],
  };
  if (!isPlainObject(value)) return base;
  const extra = leftover(value, ENCOUNTER_KNOWN);
  const present: string[] = [];
  const row: EncounterRow = {
    ...base,
    passthrough: false,
    raw: null,
    extra,
    presentKeys: present,
    clientId: takeString(value, 'id', extra, present),
    name: takeString(value, 'name', extra, present),
  };
  if (Object.prototype.hasOwnProperty.call(value, 'tokens')) {
    if (Array.isArray(value.tokens)) {
      present.push('tokens');
      row.tokensPresent = true;
      row.tokens = value.tokens.map(encodeToken);
    } else extra.tokens = value.tokens;
  }
  row.extra = extra;
  return row;
}

function decodeEncounter(row: EncounterRow): unknown {
  if (row.passthrough) return row.raw;
  const out = cloneExtra(row.extra);
  const columns: Record<string, unknown> = { id: row.clientId, name: row.name, tokens: row.tokens.map(decodeToken) };
  for (const key of row.presentKeys) assignOwn(out, { [key]: columns[key] });
  return out;
}

const SNAPSHOT_KNOWN = new Set(['id', 'name', 'createdAt', 'state']);

function encodeSnapshot(value: unknown, sort: number): SnapshotRow {
  const base: SnapshotRow = {
    sort, passthrough: true, raw: value, presentKeys: [], extra: {},
    clientId: null, name: null, createdAtMs: null, stateNull: false, board: null,
  };
  if (!isPlainObject(value)) return base;
  const extra = leftover(value, SNAPSHOT_KNOWN);
  const present: string[] = [];
  const row: SnapshotRow = {
    ...base,
    passthrough: false,
    raw: null,
    extra,
    presentKeys: present,
    clientId: takeString(value, 'id', extra, present),
    name: takeString(value, 'name', extra, present),
    createdAtMs: takeNumber(value, 'createdAt', extra, present),
  };
  if (Object.prototype.hasOwnProperty.call(value, 'state')) {
    const state = value.state;
    if (state === null) {
      present.push('state');
      row.stateNull = true;
    } else if (isPlainObject(state)) {
      present.push('state');
      row.board = encodeBoard(state);
    } else {
      extra.state = state;
    }
  }
  row.extra = extra;
  return row;
}

function decodeSnapshot(row: SnapshotRow): unknown {
  if (row.passthrough) return row.raw;
  const out = cloneExtra(row.extra);
  const columns: Record<string, unknown> = {
    id: row.clientId,
    name: row.name,
    createdAt: row.createdAtMs,
    state: row.stateNull ? null : row.board ? decodeBoard(row.board) : {},
  };
  for (const key of row.presentKeys) assignOwn(out, { [key]: columns[key] });
  return out;
}

/**
 * Split one battle-map JSON value into relational rows.
 * Returns ok:false when the top-level value is not a plain object (null,
 * array, string, number). Callers leave that legacy value untouched.
 */
export function stateToDocument(state: unknown): EncodeResult {
  if (!isPlainObject(state)) return { ok: false, reason: 'Battle map JSON must be an object' };
  const boardInput: JsonObject = {};
  let encounters: unknown[] | null = null;
  let snapshots: unknown[] | null = null;
  for (const key of Object.keys(state)) {
    const value = state[key];
    if (key === 'encounters' && Array.isArray(value)) {
      encounters = value;
      continue;
    }
    if (key === 'snapshots' && Array.isArray(value)) {
      snapshots = value;
      continue;
    }
    boardInput[key] = value;
  }
  const board = encodeBoard(boardInput);
  if (encounters) board.presentKeys.push('encounters');
  if (snapshots) board.presentKeys.push('snapshots');
  return {
    ok: true,
    document: {
      board,
      encounters: (encounters ?? []).map(encodeEncounter),
      snapshots: (snapshots ?? []).map(encodeSnapshot),
    },
  };
}

/** Rebuild the JSON document from rows. Key order follows presentKeys / extra. */
export function documentToState(document: BattleDocument): JsonObject {
  const state = decodeBoard(document.board);
  if (document.board.presentKeys.includes('encounters')) {
    assignOwn(state, { encounters: document.encounters.map(decodeEncounter) });
  }
  if (document.board.presentKeys.includes('snapshots')) {
    assignOwn(state, { snapshots: document.snapshots.map(decodeSnapshot) });
  }
  return state;
}

export function roundTripState(state: unknown): EncodeResult & { state?: JsonObject } {
  const encoded = stateToDocument(state);
  if (!encoded.ok) return encoded;
  return { ok: true, document: encoded.document, state: documentToState(encoded.document) };
}

/**
 * Where a read should come from during the cutover.
 * A backfilled map (document !== null) wins. Otherwise a plain-object legacy
 * value is returned as-is. Null/absent legacy is an empty document. Any other
 * legacy shape is malformed: the caller gets a safe empty object and a flag,
 * and the stored JSON is not rewritten.
 */
export function resolveBattleRead(input: { document: BattleDocument | null; legacy: unknown }): {
  source: 'tables' | 'legacy' | 'empty';
  malformedLegacy: boolean;
  state: JsonObject;
} {
  const malformedLegacy = input.legacy != null && !isPlainObject(input.legacy);
  if (input.document) {
    return { source: 'tables', malformedLegacy, state: documentToState(input.document) };
  }
  if (isPlainObject(input.legacy)) return { source: 'legacy', malformedLegacy: false, state: input.legacy };
  return { source: 'empty', malformedLegacy, state: {} };
}

/**
 * Dual-write the legacy JSON column on new writes until cutover.
 * Default is on. Set BATTLE_MAP_DUAL_WRITE=0|false|off|no to stop.
 */
export function dualWriteLegacyBattleJson(): boolean {
  const value = (process.env.BATTLE_MAP_DUAL_WRITE ?? '').trim().toLowerCase();
  return value !== '0' && value !== 'false' && value !== 'off' && value !== 'no';
}

function addTokenCounts(tokens: unknown, counts: BattleCounts) {
  if (!Array.isArray(tokens)) return;
  counts.tokens += tokens.length;
  for (const token of tokens) {
    if (isPlainObject(token) && Array.isArray(token.conditions) && token.conditions.every((item) => typeof item === 'string')) {
      counts.conditions += token.conditions.length;
    }
  }
}

function addBoardCounts(source: JsonObject, counts: BattleCounts) {
  addTokenCounts(source.tokens, counts);
  if (Array.isArray(source.highlights)) counts.highlights += source.highlights.length;
  if (Array.isArray(source.fog)) counts.fog += source.fog.length;
  if (Array.isArray(source.turnOrder)) counts.turns += source.turnOrder.length;
  if (Array.isArray(source.texts)) counts.texts += source.texts.length;
  if (Array.isArray(source.pins)) counts.pins += source.pins.length;
  if (Array.isArray(source.drawings)) {
    counts.drawings += source.drawings.length;
    for (const drawing of source.drawings) {
      if (isPlainObject(drawing) && Array.isArray(drawing.points)) counts.points += drawing.points.length;
    }
  }
}

/** Independent walk of a JSON document. Used to verify row counts, not derived from the encoder. */
export function countState(state: unknown): BattleCounts | null {
  if (!isPlainObject(state)) return null;
  const counts = emptyCounts();
  addBoardCounts(state, counts);
  if (Array.isArray(state.encounters)) {
    counts.encounters += state.encounters.length;
    for (const encounter of state.encounters) {
      if (isPlainObject(encounter)) addTokenCounts(encounter.tokens, counts);
    }
  }
  if (Array.isArray(state.snapshots)) {
    counts.snapshots += state.snapshots.length;
    for (const snapshot of state.snapshots) {
      if (isPlainObject(snapshot) && isPlainObject(snapshot.state)) addBoardCounts(snapshot.state, counts);
    }
  }
  return counts;
}

function addTokenRows(rows: TokenRow[], counts: BattleCounts) {
  counts.tokens += rows.length;
  for (const row of rows) {
    if (!row.passthrough && row.presentKeys.includes('conditions')) counts.conditions += row.conditions.length;
  }
}

function addBoardRows(board: Board, counts: BattleCounts) {
  addTokenRows(board.tokens, counts);
  counts.highlights += board.highlights.length;
  counts.fog += board.fog.length;
  counts.turns += board.turns.length;
  counts.texts += board.texts.length;
  counts.pins += board.pins.length;
  counts.drawings += board.drawings.length;
  for (const drawing of board.drawings) {
    if (drawing.pointsPresent) counts.points += drawing.points.length;
  }
}

export function countDocument(document: BattleDocument): BattleCounts {
  const counts = emptyCounts();
  addBoardRows(document.board, counts);
  counts.encounters += document.encounters.length;
  for (const encounter of document.encounters) {
    if (encounter.tokensPresent) addTokenRows(encounter.tokens, counts);
  }
  counts.snapshots += document.snapshots.length;
  for (const snapshot of document.snapshots) {
    if (snapshot.board && snapshot.presentKeys.includes('state') && !snapshot.stateNull) addBoardRows(snapshot.board, counts);
  }
  return counts;
}

export function countsMatch(state: unknown, document: BattleDocument): boolean {
  const fromState = countState(state);
  if (!fromState) return false;
  const fromRows = countDocument(document);
  return (Object.keys(fromState) as (keyof BattleCounts)[]).every((key) => fromState[key] === fromRows[key]);
}

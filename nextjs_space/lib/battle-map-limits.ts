// Caps for a battle-map write. Real play stays far under these: a 40×40 map
// has 1,600 fog cells, a busy fight is a few dozen tokens, and a long freehand
// stroke is a few hundred points. The numbers are high enough that a DM can
// keep dozens of full-board snapshots without hitting them. They exist so a
// hostile or accidental payload cannot fan out into millions of rows.
//
// Byte overflows are HTTP 413. Row overflows are HTTP 400. Neither path
// truncates. The backfill copies a legacy document that is already over the
// cap and reports it; it does not clip.

import { isPlainObject, type JsonObject } from '@/lib/battle-map-codec';

export const BATTLE_MAP_LIMITS = {
  /** UTF-8 size of the battle-map state object itself (not the PUT envelope). */
  maxBytes: 8 * 1024 * 1024,
  /**
   * Content-Length ceiling for PUT /api/maps/battle. The envelope
   * ({ campaignId, version, state }) is small; 64 KiB covers it.
   */
  maxRequestBytes: 8 * 1024 * 1024 + 64 * 1024,
  /** Live tokens plus encounter tokens plus snapshot tokens. */
  tokens: 10_000,
  /** Conditions stored as rows on one token. */
  conditionsPerToken: 64,
  /** Live drawings plus snapshot drawings. */
  drawings: 4_000,
  pointsPerDrawing: 2_000,
  /** Live fog cells plus snapshot fog cells, including duplicate entries. */
  fogCells: 100_000,
  texts: 2_000,
  pins: 2_000,
  highlights: 2_000,
  /** Initiative rows on the live board and inside snapshots. */
  turns: 10_000,
  encounters: 200,
  snapshots: 50,
} as const;

export type BattleMapLimits = { [K in keyof typeof BATTLE_MAP_LIMITS]: number };

export type BattleMapLimitName = keyof BattleMapLimits;

export type BattleMapLimitViolation = {
  limit: BattleMapLimitName;
  actual: number;
  max: number;
  /** Token or drawing id, when the cap is per item. */
  detail?: string;
};

export type BattleMapWriteRejection = {
  status: 413 | 400;
  error: string;
  violations: BattleMapLimitViolation[];
};

const LIMIT_LABEL: Record<BattleMapLimitName, string> = {
  maxBytes: 'state bytes',
  maxRequestBytes: 'request bytes',
  tokens: 'tokens',
  conditionsPerToken: 'conditions on one token',
  drawings: 'drawings',
  pointsPerDrawing: 'points on one drawing',
  fogCells: 'fog cells',
  texts: 'texts',
  pins: 'pins',
  highlights: 'highlights',
  turns: 'turn entries',
  encounters: 'encounters',
  snapshots: 'snapshots',
};

export function battleMapByteSize(state: unknown): number {
  return Buffer.byteLength(JSON.stringify(state), 'utf8');
}

export function battleMapContentLengthRejection(header: string | null): string | null {
  if (header == null || header.trim() === '') return null;
  const n = Number(header);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > BATTLE_MAP_LIMITS.maxRequestBytes) {
    return `Battle map request is ${n} bytes, over the ${BATTLE_MAP_LIMITS.maxRequestBytes} byte limit`;
  }
  return null;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function itemId(value: unknown, fallback: string): string {
  if (isPlainObject(value) && typeof value.id === 'string' && value.id) return value.id;
  return fallback;
}

/**
 * Row counts a write would insert. Arrays that are not arrays are ignored
 * here (the codec keeps them in `extra`); the byte cap still applies.
 * `limits` overrides the defaults so tests can force a violation without
 * allocating a full production-sized map.
 */
export function battleMapLimitViolations(
  state: unknown,
  limits: BattleMapLimits = BATTLE_MAP_LIMITS,
): BattleMapLimitViolation[] {
  if (!isPlainObject(state)) return [];
  const violations: BattleMapLimitViolation[] = [];
  const totals = {
    tokens: 0,
    drawings: 0,
    fogCells: 0,
    texts: 0,
    pins: 0,
    highlights: 0,
    turns: 0,
    encounters: 0,
    snapshots: 0,
  };

  const addBoard = (board: JsonObject) => {
    const tokens = Array.isArray(board.tokens) ? board.tokens : [];
    totals.tokens += tokens.length;
    tokens.forEach((token, index) => {
      if (!isPlainObject(token) || !Array.isArray(token.conditions)) return;
      if (token.conditions.length > limits.conditionsPerToken) {
        violations.push({
          limit: 'conditionsPerToken',
          actual: token.conditions.length,
          max: limits.conditionsPerToken,
          detail: itemId(token, `token ${index}`),
        });
      }
    });
    const drawings = Array.isArray(board.drawings) ? board.drawings : [];
    totals.drawings += drawings.length;
    drawings.forEach((drawing, index) => {
      if (!isPlainObject(drawing) || !Array.isArray(drawing.points)) return;
      if (drawing.points.length > limits.pointsPerDrawing) {
        violations.push({
          limit: 'pointsPerDrawing',
          actual: drawing.points.length,
          max: limits.pointsPerDrawing,
          detail: itemId(drawing, `drawing ${index}`),
        });
      }
    });
    totals.fogCells += arrayLength(board.fog);
    totals.texts += arrayLength(board.texts);
    totals.pins += arrayLength(board.pins);
    totals.highlights += arrayLength(board.highlights);
    totals.turns += arrayLength(board.turnOrder);
  };

  addBoard(state);
  if (Array.isArray(state.encounters)) {
    totals.encounters += state.encounters.length;
    for (const encounter of state.encounters) {
      if (isPlainObject(encounter)) addBoard({ tokens: encounter.tokens });
    }
  }
  if (Array.isArray(state.snapshots)) {
    totals.snapshots += state.snapshots.length;
    for (const snapshot of state.snapshots) {
      if (isPlainObject(snapshot) && isPlainObject(snapshot.state)) addBoard(snapshot.state);
    }
  }

  const caps: Array<[Exclude<BattleMapLimitName, 'maxBytes' | 'maxRequestBytes' | 'conditionsPerToken' | 'pointsPerDrawing'>, number]> = [
    ['tokens', totals.tokens],
    ['drawings', totals.drawings],
    ['fogCells', totals.fogCells],
    ['texts', totals.texts],
    ['pins', totals.pins],
    ['highlights', totals.highlights],
    ['turns', totals.turns],
    ['encounters', totals.encounters],
    ['snapshots', totals.snapshots],
  ];
  for (const [limit, actual] of caps) {
    if (actual > limits[limit]) violations.push({ limit, actual, max: limits[limit] });
  }
  return violations;
}

function violationText(violation: BattleMapLimitViolation): string {
  const where = violation.detail ? ` (${violation.detail})` : '';
  return `${LIMIT_LABEL[violation.limit]} ${violation.actual} > ${violation.max}${where}`;
}

/** Null when the state is within the caps. Does not mutate or truncate. */
export function battleMapWriteRejection(
  state: unknown,
  limits: BattleMapLimits = BATTLE_MAP_LIMITS,
): BattleMapWriteRejection | null {
  let bytes: number;
  try {
    bytes = battleMapByteSize(state);
  } catch {
    return { status: 400, error: 'Battle map state is not JSON-serializable', violations: [] };
  }
  if (bytes > limits.maxBytes) {
    const violations: BattleMapLimitViolation[] = [{ limit: 'maxBytes', actual: bytes, max: limits.maxBytes }];
    return {
      status: 413,
      error: `Battle map state is ${bytes} bytes, over the ${limits.maxBytes} byte limit`,
      violations,
    };
  }
  const violations = battleMapLimitViolations(state, limits);
  if (violations.length === 0) return null;
  const shown = violations.slice(0, 8).map(violationText).join('; ');
  const more = violations.length > 8 ? `; and ${violations.length - 8} more` : '';
  return { status: 400, error: `Battle map exceeds row limits: ${shown}${more}`, violations };
}

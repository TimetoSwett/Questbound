// Pure keyset-paging helpers for the dice-roll history. No Prisma/Next
// imports so both the API route and the client bundle can use this.
// A cursor pairs an ISO timestamp (ms precision) with the roll id, which
// breaks ties between rolls created in the same millisecond. The token is
// `${iso}_${id}` (ids are validated against [A-Za-z0-9_-], so `_` only
// appears as the separator; we split on the LAST `_` regardless).

export type RollCursor = { createdAt: Date; id: string };
export type RollRow = { createdAt: Date | string; id: string };
export type CursorDirection = 'before' | 'after';

const ID_MAX_LEN = 64;
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function isValidId(id: string): boolean {
  return id.length > 0 && id.length <= ID_MAX_LEN && ID_PATTERN.test(id);
}

export function encodeRollCursor(row: RollRow): string {
  return `${new Date(row.createdAt).toISOString()}_${row.id}`;
}

export function decodeRollCursor(token: string): RollCursor | null {
  const sep = token.lastIndexOf('_');
  if (sep < 0) return null;
  const createdAt = new Date(token.slice(0, sep));
  const id = token.slice(sep + 1);
  if (Number.isNaN(+createdAt) || !isValidId(id)) return null;
  return { createdAt, id };
}

// Accepts, in priority order: (a) an encoded token (`cursor` when paging
// before, `afterCursor` when paging after); (b) a timestamp+id pair
// (`before`+`beforeId` / `after`+`afterId`); (c) a legacy timestamp-only
// `before`/`after`, returned as legacyTimestamp (not an error). Returns
// 'invalid' for malformed timestamps/tokens or an id without a timestamp.
export function parseRollCursorParams(
  params: URLSearchParams,
  direction: CursorDirection,
): { cursor: RollCursor | null; legacyTimestamp: Date | null } | 'invalid' {
  const token = params.get(direction === 'before' ? 'cursor' : 'afterCursor');
  if (token !== null) {
    const cursor = decodeRollCursor(token);
    return cursor ? { cursor, legacyTimestamp: null } : 'invalid';
  }
  const ts = params.get(direction);
  const id = params.get(`${direction}Id`);
  if (ts === null && id === null) return { cursor: null, legacyTimestamp: null };
  if (ts === null) return 'invalid'; // id without a timestamp
  const createdAt = new Date(ts);
  if (Number.isNaN(+createdAt)) return 'invalid';
  if (id === null) return { cursor: null, legacyTimestamp: createdAt }; // legacy
  if (!isValidId(id)) return 'invalid';
  return { cursor: { createdAt, id }, legacyTimestamp: null };
}

// Prisma-shaped keyset fragment: strictly older (or newer) than the cursor
// under (createdAt DESC, id DESC) ordering.
export function keysetWhere(direction: CursorDirection, cursor: RollCursor) {
  const op = direction === 'before' ? 'lt' : 'gt';
  return {
    OR: [
      { createdAt: { [op]: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { [op]: cursor.id } },
    ],
  };
}

// Legacy timestamp-only cursors have no id tiebreaker.
export function legacyWhere(direction: CursorDirection, ts: Date) {
  return { createdAt: direction === 'before' ? { lt: ts } : { gt: ts } };
}

export type RollOrderBy = { createdAt: 'asc' | 'desc' } | { id: 'asc' | 'desc' };

export function rollOrder(direction: CursorDirection): RollOrderBy[] {
  const dir: 'asc' | 'desc' = direction === 'after' ? 'asc' : 'desc';
  return [{ createdAt: dir }, { id: dir }];
}

// Matches Postgres byte ordering of ids (plain <</>, NOT localeCompare).
export function compareRollsDesc(a: RollRow, b: RollRow): number {
  const at = +new Date(a.createdAt);
  const bt = +new Date(b.createdAt);
  if (at !== bt) return bt - at;
  if (a.id < b.id) return 1;
  if (a.id > b.id) return -1;
  return 0;
}

// In-memory equivalent of the 'before' keyset condition.
export function isOlderThan(row: RollRow, cursor: RollCursor): boolean {
  const t = +new Date(row.createdAt);
  const ct = +cursor.createdAt;
  return t < ct || (t === ct && row.id < cursor.id);
}

// Pure reference implementation of older-direction paging.
export function pageOlder(
  rows: RollRow[],
  cursor: RollCursor | null,
  limit: number,
): { page: RollRow[]; nextCursor: string | null } {
  const sorted = [...rows].sort(compareRollsDesc);
  const eligible = cursor ? sorted.filter((r) => isOlderThan(r, cursor)) : sorted;
  const page = eligible.slice(0, Math.max(0, limit));
  const hasMore = page.length >= limit && page.length > 0;
  return { page, nextCursor: hasMore ? encodeRollCursor(page[page.length - 1]) : null };
}

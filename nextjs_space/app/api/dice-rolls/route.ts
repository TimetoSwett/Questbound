export const dynamic = 'force-dynamic';
import { publish } from '@/lib/realtime';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { parseDiceExpression, rollDice } from '@/lib/dice';
import {
  encodeRollCursor, keysetWhere, legacyWhere, parseRollCursorParams, rollOrder,
} from '@/lib/dice-roll-cursor';

const rollSelect = {
  id: true, userName: true, expression: true, results: true,
  total: true, isSecret: true, createdAt: true,
} as const;

// Simple per-user, per-process rate limit for POST (single-instance app).
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 20;
const recentRolls = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const hits = (recentRolls.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    recentRolls.set(userId, hits);
    return true;
  }
  hits.push(now);
  recentRolls.set(userId, hits);
  if (recentRolls.size > 5000) {
    for (const [k, v] of recentRolls) if (!v.some((t) => now - t < RATE_WINDOW_MS)) recentRolls.delete(k);
  }
  return false;
}

// GET ?campaignId=&limit= (+ cursor params) — campaign members only.
// Non-DMs never receive secret rolls. Returns chronological (oldest first).
// Keyset cursors pair an ISO timestamp with a roll ID (id breaks ties when
// rolls share a millisecond, so nothing is skipped or duplicated). Accepted
// formats: `cursor=` / `afterCursor=` (opaque token), `before`+`beforeId` /
// `after`+`afterId`, and the legacy timestamp-only `before`/`after`. When
// paging older (or on the initial load) the response carries X-Next-Cursor
// with the encoded cursor of the oldest row returned, omitted when the page
// is shorter than the limit.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10) || 100));
  const beforeParsed = parseRollCursorParams(searchParams, 'before');
  const afterParsed = parseRollCursorParams(searchParams, 'after');
  if (beforeParsed === 'invalid' || afterParsed === 'invalid') {
    return NextResponse.json({ error: 'Invalid cursor' }, { status: 400 });
  }

  const where: Record<string, unknown> = { campaignId };
  if (role !== 'dm') where.isSecret = false;
  // `before` wins when both directions are sent, matching the old route.
  let direction: 'before' | 'after' | null = null;
  if (beforeParsed.cursor) {
    where.OR = keysetWhere('before', beforeParsed.cursor).OR;
    direction = 'before';
  } else if (beforeParsed.legacyTimestamp) {
    Object.assign(where, legacyWhere('before', beforeParsed.legacyTimestamp));
    direction = 'before';
  } else if (afterParsed.cursor) {
    where.OR = keysetWhere('after', afterParsed.cursor).OR;
    direction = 'after';
  } else if (afterParsed.legacyTimestamp) {
    Object.assign(where, legacyWhere('after', afterParsed.legacyTimestamp));
    direction = 'after';
  }

  // Polling (`after`) reads oldest-first so a burst of >limit new rolls isn't
  // skipped; history/initial load read newest-first.
  const rolls = await prisma.diceRoll.findMany({
    where,
    orderBy: rollOrder(direction === 'after' ? 'after' : 'before'),
    take: limit,
    select: rollSelect,
  });
  const pagingOlder = direction !== 'after';
  if (pagingOlder) rolls.reverse();
  const res = NextResponse.json(rolls);
  if (pagingOlder && rolls.length >= limit) {
    res.headers.set('X-Next-Cursor', encodeRollCursor(rolls[0]));
  }
  return res;
}

// POST {campaignId, expression, isSecret?} — rolls on the server so the
// result can't be faked. Secret rolls are DM-only.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (rateLimited(session.user.id)) {
    return NextResponse.json({ error: 'Too many rolls, slow down' }, { status: 429 });
  }
  const raw = await request.text().catch(() => '');
  if (raw.length > 2000) return NextResponse.json({ error: 'Request too large' }, { status: 413 });
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(raw) as Record<string, unknown> | null;
  } catch {
    body = null;
  }
  const campaignId = body?.campaignId;
  if (typeof campaignId !== 'string' || !campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  }
  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  const isSecret = body?.isSecret === true;
  if (isSecret && role !== 'dm') {
    return NextResponse.json({ error: 'Only the DM can make secret rolls' }, { status: 403 });
  }
  const parsed = parseDiceExpression(String(body?.expression ?? ''));
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid dice expression (e.g. 2d20+5)' }, { status: 400 });
  }

  const { results, total } = rollDice(parsed.count, parsed.sides, parsed.modifier);
  const roll = await prisma.diceRoll.create({
    data: {
      campaignId,
      userId: session.user.id,
      userName: session.user.name ?? 'Adventurer',
      expression: parsed.expression,
      results,
      total,
      isSecret,
    },
    select: rollSelect,
  });
  publish(campaignId, 'rolls', { gmOnly: isSecret });
  return NextResponse.json(roll, { status: 201 });
}

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { parseDiceExpression, rollDice } from '@/lib/dice';

const rollSelect = {
  id: true, userName: true, expression: true, results: true,
  total: true, isSecret: true, createdAt: true,
} as const;

// GET ?campaignId=&limit=&before=&after= — campaign members only.
// Non-DMs never receive secret rolls. Returns chronological (oldest first).
// `before` (ISO) pages older rolls; `after` (ISO) polls for newer ones.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10) || 100));
  const before = searchParams.get('before');
  const after = searchParams.get('after');

  const where: Record<string, unknown> = { campaignId };
  if (role !== 'dm') where.isSecret = false;
  if (before) where.createdAt = { lt: new Date(before) };
  else if (after) where.createdAt = { gte: new Date(after) };

  const rolls = await prisma.diceRoll.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: rollSelect,
  });
  rolls.sort((a, b) => +a.createdAt - +b.createdAt);
  return NextResponse.json(rolls);
}

// POST {campaignId, expression, isSecret?} — rolls on the server so the
// result can't be faked. Secret rolls are DM-only.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
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
  return NextResponse.json(roll, { status: 201 });
}

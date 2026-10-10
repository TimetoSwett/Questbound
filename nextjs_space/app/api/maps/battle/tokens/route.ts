export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

// PATCH /api/maps/battle/tokens — move a single token (x/y only).
// DM may move any token. A player may move only tokens linked to a
// character they own in this campaign. Coordinates must be in grid bounds.
// (Full-state writes stay DM-only via PUT /api/maps/battle.)
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { campaignId, tokenId, x, y } = await request.json();
  if (!campaignId || !tokenId) return NextResponse.json({ error: 'campaignId and tokenId required' }, { status: 400 });
  if (!Number.isInteger(x) || !Number.isInteger(y)) return NextResponse.json({ error: 'x and y must be integers' }, { status: 400 });

  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  // Atomic read-modify-write: lock the campaign row so concurrent moves (or a
  // DM full-state save) can't interleave, change only this token, and bump
  // battleMapVersion so a stale DM PUT is rejected rather than undoing it.
  type Result = { status: number; body: Record<string, unknown> };
  const result: Result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Campaign" WHERE id = ${campaignId} FOR UPDATE`;
    const campaign = await tx.campaign.findUnique({ where: { id: campaignId }, select: { battleMapState: true } });
    const st: any = campaign?.battleMapState ?? {};
    const gw = st?.gridWidth ?? 20;
    const gh = st?.gridHeight ?? 20;
    if (x < 0 || y < 0 || x >= gw || y >= gh) return { status: 400, body: { error: 'Out of bounds' } };

    const tokens = Array.isArray(st?.tokens) ? st.tokens : [];
    const token = tokens.find((t: any) => t?.id === tokenId);
    if (!token) return { status: 404, body: { error: 'Token not found' } };

    if (role !== 'dm') {
      const denied = { status: 403, body: { error: 'You can only move your own character tokens' } };
      if (!token.characterId) return denied;
      const character = await tx.character.findUnique({ where: { id: token.characterId } });
      if (!character || character.userId !== session.user!.id || character.campaignId !== campaignId) return denied;
    }

    const next = { ...st, tokens: tokens.map((t: any) => (t?.id === tokenId ? { ...t, x, y } : t)) };
    await tx.campaign.update({ where: { id: campaignId }, data: { battleMapState: next, battleMapVersion: { increment: 1 } } });
    return { status: 200, body: { ok: true, token: { ...token, x, y } } };
  });
  return NextResponse.json(result.body, { status: result.status });
}

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

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { battleMapState: true } });
  const st: any = campaign?.battleMapState ?? {};
  const gw = st?.gridWidth ?? 20;
  const gh = st?.gridHeight ?? 20;
  if (x < 0 || y < 0 || x >= gw || y >= gh) return NextResponse.json({ error: 'Out of bounds' }, { status: 400 });

  const tokens = Array.isArray(st?.tokens) ? st.tokens : [];
  const token = tokens.find((t: any) => t?.id === tokenId);
  if (!token) return NextResponse.json({ error: 'Token not found' }, { status: 404 });

  if (role !== 'dm') {
    if (!token.characterId) return NextResponse.json({ error: 'You can only move your own character tokens' }, { status: 403 });
    const character = await prisma.character.findUnique({ where: { id: token.characterId } });
    if (!character || character.userId !== session.user.id || character.campaignId !== campaignId) {
      return NextResponse.json({ error: 'You can only move your own character tokens' }, { status: 403 });
    }
  }

  const next = { ...st, tokens: tokens.map((t: any) => (t?.id === tokenId ? { ...t, x, y } : t)) };
  await prisma.campaign.update({ where: { id: campaignId }, data: { battleMapState: next } });
  return NextResponse.json({ ok: true, token: { ...token, x, y } });
}

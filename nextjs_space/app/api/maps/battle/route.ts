export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { battleMapState: true } });
  const raw = (campaign?.battleMapState ?? {}) as Record<string, any>;
  const state = {
    gridWidth: 20, gridHeight: 20, tokens: [], highlights: [], fog: [], backgroundImage: null,
    turnOrder: [], activeId: null, feetPerSquare: 5, cellNumbers: true, handout: null,
    encounters: [], snapshots: [], drawings: [], texts: [], pins: [],
    ...raw,
  };

  // Attach linked wiki article titles to battle pins, mirroring the world-pins
  // API: dm_only article titles are never leaked to players.
  const pins = Array.isArray(state.pins) ? state.pins : [];
  const articleIds = [...new Set(pins.map((p: any) => p?.wikiArticleId).filter((id: any) => typeof id === 'string' && id))];
  let pages: Array<{ id: string; title: string; visibility: string }> = [];
  if (articleIds.length > 0) {
    pages = await prisma.wikiPage.findMany({
      where: { id: { in: articleIds }, campaignId },
      select: { id: true, title: true, visibility: true },
    });
  }
  const byId = new Map(pages.map((p) => [p.id, p]));
  const safePins = pins.map((p: any) => {
    const pg = p.wikiArticleId ? byId.get(p.wikiArticleId) : undefined;
    const wikiArticle = pg && (role === 'dm' || pg.visibility === 'shared') ? { id: pg.id, title: pg.title } : null;
    return { ...p, wikiArticle };
  });
  return NextResponse.json({ ...state, pins: safePins });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { campaignId, state } = await request.json();
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });
  await prisma.campaign.update({ where: { id: campaignId }, data: { battleMapState: state } });
  return NextResponse.json({ ok: true });
}

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

const WIKI_SELECT = { id: true, title: true, visibility: true } as const;

// Resolve an optional wikiPageId to a validated page id, or null.
// Returns { ok: false } when a non-empty id is invalid for this campaign.
async function resolveWikiPageId(
  wikiPageId: unknown,
  campaignId: string
): Promise<{ ok: true; id: string | null } | { ok: false }> {
  if (!wikiPageId) return { ok: true, id: null };
  if (typeof wikiPageId !== 'string') return { ok: false };
  const page = await prisma.wikiPage.findUnique({ where: { id: wikiPageId } });
  if (!page || page.campaignId !== campaignId) return { ok: false };
  return { ok: true, id: page.id };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const where = role === 'dm' ? { campaignId } : { campaignId, visibility: 'shared' };
  const pins = await prisma.worldMapPin.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    include: { wikiPage: { select: WIKI_SELECT } },
  });

  // Don't leak dm_only article titles to players through shared pins.
  const safe = (pins ?? []).map((p) => {
    if (role !== 'dm' && p.wikiPage && p.wikiPage.visibility !== 'shared') {
      const { wikiPage, ...rest } = p;
      return { ...rest, wikiPage: null };
    }
    return p;
  });
  return NextResponse.json(safe);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { campaignId, x, y, label, description, category, visibility, wikiPageId } = await request.json();
  const role = await getUserRole(session.user.id, campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });

  const link = await resolveWikiPageId(wikiPageId, campaignId);
  if (!link.ok) return NextResponse.json({ error: 'Invalid wiki page' }, { status: 400 });

  const pin = await prisma.worldMapPin.create({
    data: { campaignId, x, y, label: label || 'Pin', description: description || '', category: category || 'POI', visibility: visibility || 'dm_only', wikiPageId: link.id },
  });
  return NextResponse.json(pin);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, wikiPageId, ...data } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const pin = await prisma.worldMapPin.findUnique({ where: { id } });
  if (!pin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, pin.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });

  const updateData: Record<string, any> = { ...data };
  if (wikiPageId !== undefined) {
    const link = await resolveWikiPageId(wikiPageId, pin.campaignId);
    if (!link.ok) return NextResponse.json({ error: 'Invalid wiki page' }, { status: 400 });
    updateData.wikiPageId = link.id;
  }
  const updated = await prisma.worldMapPin.update({ where: { id }, data: updateData });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const pin = await prisma.worldMapPin.findUnique({ where: { id } });
  if (!pin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, pin.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });
  await prisma.worldMapPin.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

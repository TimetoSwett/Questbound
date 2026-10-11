export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

const PLACE_LEVELS = ['hidden', 'revealed'] as const;

async function getTown(id: string) {
  return prisma.town.findUnique({ where: { id }, select: { id: true, campaignId: true } });
}

async function validShopkeeper(shopkeeperId: string | null, campaignId: string): Promise<boolean> {
  if (!shopkeeperId) return true;
  const c = await prisma.creature.findFirst({
    where: { id: shopkeeperId, campaignId },
    select: { id: true, isNpc: true },
  });
  return !!c && c.isNpc;
}

function parsePlaceInput(body: Record<string, unknown>) {
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
  if (!name) return { ok: false as const, error: 'Name is required' };
  const type = typeof body.type === 'string' ? body.type.slice(0, 100) : '';
  const description = typeof body.description === 'string' ? body.description.slice(0, 100000) : '';
  const gmNotes = typeof body.gmNotes === 'string' ? body.gmNotes.slice(0, 100000) : '';
  const shopkeeperId = typeof body.shopkeeperId === 'string' && body.shopkeeperId ? body.shopkeeperId : null;
  const revealLevel =
    typeof body.revealLevel === 'string' && (PLACE_LEVELS as readonly string[]).includes(body.revealLevel)
      ? body.revealLevel
      : 'hidden';
  return { ok: true as const, data: { name, type, description, gmNotes, shopkeeperId, revealLevel } };
}

// POST /api/towns/[id]/places {name, type?, description?, shopkeeperId?, gmNotes?, revealLevel?} — GM only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const town = await getTown(id);
  if (!town) return NextResponse.json({ error: 'Town not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, town.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the GM can manage places' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parsePlaceInput(body ?? {});
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!(await validShopkeeper(parsed.data.shopkeeperId, town.campaignId))) {
    return NextResponse.json({ error: 'Shopkeeper must be an NPC in this campaign' }, { status: 400 });
  }
  const place = await prisma.townPlace.create({
    data: { townId: id, ...parsed.data },
    include: { shopkeeper: true },
  });
  return NextResponse.json(place, { status: 201 });
}

// PUT /api/towns/[id]/places?placeId= {...fields} — GM only.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const town = await getTown(id);
  if (!town) return NextResponse.json({ error: 'Town not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, town.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the GM can manage places' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get('placeId');
  if (!placeId) return NextResponse.json({ error: 'placeId required' }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const parsed = parsePlaceInput(body ?? {});
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!(await validShopkeeper(parsed.data.shopkeeperId, town.campaignId))) {
    return NextResponse.json({ error: 'Shopkeeper must be an NPC in this campaign' }, { status: 400 });
  }
  const place = await prisma.townPlace.updateMany({
    where: { id: placeId, townId: id },
    data: parsed.data,
  });
  if (place.count === 0) return NextResponse.json({ error: 'Place not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/towns/[id]/places?placeId= — GM only.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const town = await getTown(id);
  if (!town) return NextResponse.json({ error: 'Town not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, town.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the GM can manage places' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get('placeId');
  if (!placeId) return NextResponse.json({ error: 'placeId required' }, { status: 400 });
  await prisma.townPlace.deleteMany({ where: { id: placeId, townId: id } });
  return NextResponse.json({ ok: true });
}

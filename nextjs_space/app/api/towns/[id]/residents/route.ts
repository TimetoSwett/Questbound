export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

async function getTown(id: string) {
  return prisma.town.findUnique({ where: { id }, select: { id: true, campaignId: true } });
}

// POST /api/towns/[id]/residents {creatureId, role?, disposition?} — GM only.
// The creature must be an NPC in the same campaign, and can belong to at most
// one town.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const town = await getTown(id);
  if (!town) return NextResponse.json({ error: 'Town not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, town.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the GM can manage residents' }, { status: 403 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const creatureId = body?.creatureId;
  if (typeof creatureId !== 'string' || !creatureId) {
    return NextResponse.json({ error: 'creatureId required' }, { status: 400 });
  }
  const creature = await prisma.creature.findFirst({
    where: { id: creatureId, campaignId: town.campaignId },
    select: { id: true, isNpc: true },
  });
  if (!creature) return NextResponse.json({ error: 'Creature not found in this campaign' }, { status: 404 });
  if (!creature.isNpc) return NextResponse.json({ error: 'Only NPCs can be residents' }, { status: 400 });

  const existing = await prisma.townResident.findUnique({ where: { creatureId } });
  if (existing) {
    return NextResponse.json({ error: 'That creature already belongs to a town' }, { status: 409 });
  }

  const resident = await prisma.townResident.create({
    data: {
      townId: id,
      creatureId,
      role: typeof body?.role === 'string' ? body.role.slice(0, 200) : '',
      disposition: typeof body?.disposition === 'string' ? body.disposition.slice(0, 200) : '',
    },
    include: { creature: true },
  });
  return NextResponse.json(resident, { status: 201 });
}

// DELETE /api/towns/[id]/residents?creatureId= — GM only.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const town = await getTown(id);
  if (!town) return NextResponse.json({ error: 'Town not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, town.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the GM can manage residents' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const creatureId = searchParams.get('creatureId');
  if (!creatureId) return NextResponse.json({ error: 'creatureId required' }, { status: 400 });
  await prisma.townResident.deleteMany({ where: { townId: id, creatureId } });
  return NextResponse.json({ ok: true });
}

// PUT /api/towns/[id]/residents?creatureId= {role?, disposition?} — GM only.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const town = await getTown(id);
  if (!town) return NextResponse.json({ error: 'Town not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, town.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only the GM can manage residents' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const creatureId = searchParams.get('creatureId');
  if (!creatureId) return NextResponse.json({ error: 'creatureId required' }, { status: 400 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const data: Record<string, string> = {};
  if (body?.role !== undefined) data.role = typeof body.role === 'string' ? body.role.slice(0, 200) : '';
  if (body?.disposition !== undefined) {
    data.disposition = typeof body.disposition === 'string' ? body.disposition.slice(0, 200) : '';
  }
  const resident = await prisma.townResident.updateMany({ where: { townId: id, creatureId }, data });
  if (resident.count === 0) return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

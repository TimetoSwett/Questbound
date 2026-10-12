export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

async function requireDm(userId: string, campaignId: unknown) {
  if (typeof campaignId !== 'string' || !campaignId) return null;
  const role = await getUserRole(userId, campaignId);
  return role === 'dm' ? campaignId : null;
}

function cleanItemInput(body: any) {
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : '';
  const quantity = Number.isInteger(body?.quantity) && body.quantity > 0 ? body.quantity : 1;
  const valueGp = typeof body?.valueGp === 'number' && body.valueGp >= 0 ? body.valueGp : 0;
  const weight = typeof body?.weight === 'number' && body.weight >= 0 ? body.weight : 0;
  const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 2000) : '';
  return { name, quantity, valueGp, weight, notes };
}

// POST {campaignId, name, quantity, valueGp, weight, notes, characterId?} — DM only.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const campaignId = await requireDm(session.user.id, body?.campaignId);
  if (!campaignId) return NextResponse.json({ error: 'Only DM can add items' }, { status: 403 });

  const { name, quantity, valueGp, weight, notes } = cleanItemInput(body);
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  let characterId: string | null = null;
  if (body?.characterId) {
    if (typeof body.characterId !== 'string') return NextResponse.json({ error: 'Invalid characterId' }, { status: 400 });
    const ch = await prisma.character.findUnique({ where: { id: body.characterId }, select: { campaignId: true } });
    if (!ch || ch.campaignId !== campaignId) return NextResponse.json({ error: 'Character not in campaign' }, { status: 400 });
    characterId = body.characterId;
  }

  const item = await prisma.inventoryItem.create({
    data: { campaignId, characterId, name, quantity, valueGp, weight, notes },
    include: { character: { select: { id: true, name: true, userId: true } } },
  });
  return NextResponse.json(item);
}

// PUT {id, name?, quantity?, valueGp?, weight?, notes?} — DM only.
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, existing.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM can edit items' }, { status: 403 });

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    patch.name = name;
  }
  if (body.quantity !== undefined) {
    if (!Number.isInteger(body.quantity) || body.quantity <= 0) {
      return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 });
    }
    patch.quantity = body.quantity;
  }
  if (body.valueGp !== undefined) {
    if (typeof body.valueGp !== 'number' || body.valueGp < 0) return NextResponse.json({ error: 'Invalid valueGp' }, { status: 400 });
    patch.valueGp = body.valueGp;
  }
  if (body.weight !== undefined) {
    if (typeof body.weight !== 'number' || body.weight < 0) return NextResponse.json({ error: 'Invalid weight' }, { status: 400 });
    patch.weight = body.weight;
  }
  if (body.notes !== undefined) {
    patch.notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : '';
  }

  const item = await prisma.inventoryItem.update({
    where: { id },
    data: patch,
    include: { character: { select: { id: true, name: true, userId: true } } },
  });
  return NextResponse.json(item);
}

// DELETE ?id= — DM only.
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, existing.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM can delete items' }, { status: 403 });

  await prisma.inventoryItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

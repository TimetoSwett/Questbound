export const dynamic = 'force-dynamic';
import { publish } from '@/lib/realtime';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

async function requireDm(userId: string, campaignId: unknown) {
  if (typeof campaignId !== 'string' || !campaignId) return null;
  const role = await getUserRole(userId, campaignId);
  return role === 'dm' ? campaignId : null;
}

// Bounds keep values inside the Postgres column types (quantity is int4) and
// reject Infinity (JSON 1e999), which would otherwise surface as a 500.
const MAX_QUANTITY = 1_000_000;
const MAX_NUMBER = 1_000_000_000;

const isQuantity = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0 && (v as number) <= MAX_QUANTITY;
const isAmount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_NUMBER;

// Returns the cleaned fields, or an error string. Omitted fields get defaults;
// fields that are present but invalid are rejected.
function cleanItemInput(body: any): { name: string; quantity: number; valueGp: number; weight: number; notes: string } | string {
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 200) : '';
  if (!name) return 'name required';
  const quantity = body?.quantity ?? 1;
  if (!isQuantity(quantity)) return `quantity must be an integer from 1 to ${MAX_QUANTITY}`;
  const valueGp = body?.valueGp ?? 0;
  if (!isAmount(valueGp)) return 'Invalid valueGp';
  const weight = body?.weight ?? 0;
  if (!isAmount(weight)) return 'Invalid weight';
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

  const cleaned = cleanItemInput(body);
  if (typeof cleaned === 'string') return NextResponse.json({ error: cleaned }, { status: 400 });
  const { name, quantity, valueGp, weight, notes } = cleaned;

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
  publish(campaignId, 'battle');
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
    if (!isQuantity(body.quantity)) {
      return NextResponse.json({ error: `quantity must be an integer from 1 to ${MAX_QUANTITY}` }, { status: 400 });
    }
    patch.quantity = body.quantity;
  }
  if (body.valueGp !== undefined) {
    if (!isAmount(body.valueGp)) return NextResponse.json({ error: 'Invalid valueGp' }, { status: 400 });
    patch.valueGp = body.valueGp;
  }
  if (body.weight !== undefined) {
    if (!isAmount(body.weight)) return NextResponse.json({ error: 'Invalid weight' }, { status: 400 });
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
  publish(existing.campaignId, 'battle');
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
  publish(existing.campaignId, 'battle');
  return NextResponse.json({ ok: true });
}

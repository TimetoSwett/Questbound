export const dynamic = 'force-dynamic';
import { publish } from '@/lib/realtime';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

// POST {id, quantity} — DM only. Moves `quantity` units of a stacked item into
// a new row (same stats, same holder). The original keeps the remainder.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const quantity = body?.quantity;
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: 'quantity must be a positive integer' }, { status: 400 });
  }

  const existing = await prisma.inventoryItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, existing.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM can split items' }, { status: 403 });
  if (quantity >= existing.quantity) {
    return NextResponse.json({ error: 'Split quantity must be less than the stack size' }, { status: 400 });
  }

  // Conditional decrement so two concurrent splits can never take more units
  // than the stack holds (the original must keep at least one).
  const result = await prisma.$transaction(async (tx) => {
    const dec = await tx.inventoryItem.updateMany({
      where: { id, quantity: { gt: quantity } },
      data: { quantity: { decrement: quantity } },
    });
    if (dec.count === 0) return null;
    const updated = await tx.inventoryItem.findUniqueOrThrow({ where: { id } });
    const created = await tx.inventoryItem.create({
      data: {
        campaignId: updated.campaignId,
        characterId: updated.characterId,
        name: updated.name,
        quantity,
        valueGp: updated.valueGp,
        weight: updated.weight,
        notes: updated.notes,
      },
      include: { character: { select: { id: true, name: true, userId: true } } },
    });
    return { updated, created };
  });
  if (!result) {
    return NextResponse.json({ error: 'Split quantity must be less than the stack size' }, { status: 409 });
  }
  const { updated, created } = result;

  publish(updated.campaignId, 'battle');
  return NextResponse.json({ updated, created });
}

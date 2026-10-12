export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

// POST {id, toCharacterId: string | null} — moves an item to a character (or
// back to the party when null). DM can move anything; a player can only move
// items their own character carries.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const toCharacterId = body?.toCharacterId ?? null;
  if (typeof id !== 'string' || !id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (toCharacterId !== null && typeof toCharacterId !== 'string') {
    return NextResponse.json({ error: 'Invalid toCharacterId' }, { status: 400 });
  }

  const existing = await prisma.inventoryItem.findUnique({
    where: { id },
    include: { character: { select: { id: true, userId: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const role = await getUserRole(session.user.id, existing.campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  // Players may only move items their own character carries.
  if (role !== 'dm') {
    if (!existing.characterId || existing.character?.userId !== session.user.id) {
      return NextResponse.json({ error: 'You can only move items your character carries' }, { status: 403 });
    }
  }

  // Destination character must be in the same campaign.
  if (toCharacterId) {
    const dest = await prisma.character.findUnique({ where: { id: toCharacterId }, select: { campaignId: true } });
    if (!dest || dest.campaignId !== existing.campaignId) {
      return NextResponse.json({ error: 'Character not in campaign' }, { status: 400 });
    }
  }

  const item = await prisma.inventoryItem.update({
    where: { id },
    data: { characterId: toCharacterId },
    include: { character: { select: { id: true, name: true, userId: true } } },
  });
  return NextResponse.json(item);
}

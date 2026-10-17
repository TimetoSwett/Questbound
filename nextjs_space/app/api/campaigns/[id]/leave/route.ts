export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { detachCampaignCharacters, getUserRole } from '@/lib/campaign-helpers';
import { publish } from '@/lib/realtime';

// POST — a player leaves the campaign. Their characters go back to their vault.
// The DM can't leave; they delete the campaign instead.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const { id } = await context.params;
  const role = await getUserRole(userId, id);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  if (role === 'dm') return NextResponse.json({ error: 'The DM cannot leave their own campaign' }, { status: 400 });
  await prisma.$transaction(async (tx) => {
    await detachCampaignCharacters(tx, id, userId);
    await tx.campaignMembership.deleteMany({ where: { campaignId: id, userId } });
  });
  publish(id, 'characters');
  publish(id, 'battle');
  publish(id, 'loot');
  return NextResponse.json({ ok: true });
}

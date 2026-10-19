export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { detachCampaignCharacters, getUserRole } from '@/lib/campaign-helpers';
import { publish } from '@/lib/realtime';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || typeof body.sharedPurse !== 'boolean') {
    return NextResponse.json({ error: 'Expected only sharedPurse as a boolean' }, { status: 400 });
  }
  const { id } = await context.params;
  const role = await getUserRole(session.user.id, id);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM can change the shared purse' }, { status: 403 });
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { sharedPurse: body.sharedPurse },
    select: { sharedPurse: true },
  });
  // Loot tabs and character sheets subscribe to this topic. Battle-map state is unchanged.
  publish(id, 'loot');
  return NextResponse.json({ sharedPurse: campaign.sharedPurse });
}

// DELETE — the campaign's DM only. Characters survive in their owners' vaults;
// everything else that belongs to the campaign (maps, wiki, bestiary, loot...) is removed.
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await context.params;
  const campaign = await prisma.campaign.findUnique({ where: { id }, select: { dmUserId: true } });
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (campaign.dmUserId !== session.user.id) return NextResponse.json({ error: 'Only the DM can delete a campaign' }, { status: 403 });
  await prisma.$transaction(async (tx) => {
    await detachCampaignCharacters(tx, id);
    await tx.campaign.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}

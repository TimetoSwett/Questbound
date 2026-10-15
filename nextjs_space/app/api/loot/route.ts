export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

// GET ?campaignId= — any campaign member. Returns party coins, all items
// (party + per-character), characters for grouping, and the caller's role.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });

  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const [campaign, items, characters] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: campaignId }, select: { partyCp: true, sharedPurse: true } }),
    prisma.inventoryItem.findMany({
      where: { campaignId },
      include: { character: { select: { id: true, name: true, userId: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.character.findMany({
      where: { campaignId },
      select: { id: true, name: true, userId: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    partyCp: campaign.partyCp,
    sharedPurse: campaign.sharedPurse,
    items,
    characters,
    role,
    userId: session.user.id,
  });
}

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { detachCampaignCharacters, generateInviteCode } from '@/lib/campaign-helpers';
import { publish } from '@/lib/realtime';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const memberships = await prisma.campaignMembership.findMany({
    where: { userId: session.user.id },
    include: {
      campaign: {
        include: {
          memberships: { include: { user: { select: { id: true, displayName: true } } } },
          _count: { select: { characters: true } },
        },
      },
    },
  });

  const campaigns = memberships.map((m: any) => ({
    ...m.campaign,
    myRole: m.role,
    playerCount: m.campaign.memberships?.length ?? 0,
  }));

  return NextResponse.json(campaigns);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { name, description } = await request.json();
  if (!name) return NextResponse.json({ error: 'Campaign name required' }, { status: 400 });

  let inviteCode = generateInviteCode();
  // Ensure unique
  let existing = await prisma.campaign.findUnique({ where: { inviteCode } });
  while (existing) {
    inviteCode = generateInviteCode();
    existing = await prisma.campaign.findUnique({ where: { inviteCode } });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      description: description ?? '',
      inviteCode,
      dmUserId: session.user.id,
      memberships: {
        create: { userId: session.user.id, role: 'dm' },
      },
    },
  });

  return NextResponse.json(campaign);
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { campaignId, name, regenerateCode, removeUserId } = await request.json();
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.dmUserId !== session.user.id) {
    return NextResponse.json({ error: 'Not the DM' }, { status: 403 });
  }

  const updates: any = {};
  if (name) updates.name = name;
  if (regenerateCode) {
    let code = generateInviteCode();
    let ex = await prisma.campaign.findUnique({ where: { inviteCode: code } });
    while (ex) { code = generateInviteCode(); ex = await prisma.campaign.findUnique({ where: { inviteCode: code } }); }
    updates.inviteCode = code;
  }

  if (removeUserId) {
    if (typeof removeUserId !== 'string') return NextResponse.json({ error: 'Invalid removeUserId' }, { status: 400 });
    if (removeUserId === campaign.dmUserId) {
      return NextResponse.json({ error: 'The DM cannot be removed from their own campaign' }, { status: 400 });
    }
    // Removed players keep their characters: they go back to the player's vault.
    await prisma.$transaction(async (tx) => {
      await detachCampaignCharacters(tx, campaignId, removeUserId);
      await tx.campaignMembership.deleteMany({ where: { campaignId, userId: removeUserId } });
    });
    publish(campaignId, 'characters');
    publish(campaignId, 'battle');
    publish(campaignId, 'loot');
  }

  const updated = await prisma.campaign.update({ where: { id: campaignId }, data: updates });
  return NextResponse.json(updated);
}

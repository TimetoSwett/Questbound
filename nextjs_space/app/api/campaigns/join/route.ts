export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code } = await request.json();
  if (!code) return NextResponse.json({ error: 'Invite code required' }, { status: 400 });

  const campaign = await prisma.campaign.findUnique({
    where: { inviteCode: code.toUpperCase().trim() },
  });
  if (!campaign) return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });

  const existing = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId: session.user.id, campaignId: campaign.id } },
  });
  if (existing) return NextResponse.json({ error: 'Already in this campaign', campaignId: campaign.id }, { status: 409 });

  await prisma.campaignMembership.create({
    data: { userId: session.user.id, campaignId: campaign.id, role: 'player' },
  });

  return NextResponse.json({ campaignId: campaign.id, name: campaign.name });
}

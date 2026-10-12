export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

// POST {campaignId, deltaCp} — DM only. Adds (or subtracts) copper from the
// party total. The total is clamped at zero.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const campaignId = body?.campaignId;
  const deltaCp = body?.deltaCp;
  if (typeof campaignId !== 'string' || !campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  }
  if (typeof deltaCp !== 'number' || !Number.isInteger(deltaCp)) {
    return NextResponse.json({ error: 'deltaCp must be an integer' }, { status: 400 });
  }

  const role = await getUserRole(session.user.id, campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM can adjust coins' }, { status: 403 });

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { partyCp: true } });
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updated = await prisma.campaign.update({
    where: { id: campaignId },
    data: { partyCp: Math.max(0, campaign.partyCp + deltaCp) },
    select: { partyCp: true },
  });
  return NextResponse.json({ partyCp: updated.partyCp });
}

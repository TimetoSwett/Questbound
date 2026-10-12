export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

// Campaign.partyCp is a 32-bit Postgres integer.
const MAX_CP = 2_147_483_647;

// POST {campaignId, deltaCp} — DM only. Adds (or subtracts) copper from the
// party total. The update is atomic; a subtraction larger than the current
// total is rejected (400) rather than silently clamped.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const campaignId = body?.campaignId;
  const deltaCp = body?.deltaCp;
  if (typeof campaignId !== 'string' || !campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  }
  if (typeof deltaCp !== 'number' || !Number.isInteger(deltaCp) || deltaCp === 0 || Math.abs(deltaCp) > MAX_CP) {
    return NextResponse.json({ error: 'deltaCp must be a non-zero integer' }, { status: 400 });
  }

  const role = await getUserRole(session.user.id, campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM can adjust coins' }, { status: 403 });

  // Conditional increment: only applies when the result stays within 0..MAX_CP.
  const res = await prisma.campaign.updateMany({
    where: {
      id: campaignId,
      partyCp: deltaCp < 0 ? { gte: -deltaCp } : { lte: MAX_CP - deltaCp },
    },
    data: { partyCp: { increment: deltaCp } },
  });

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { partyCp: true } });
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (res.count === 0) {
    return NextResponse.json(
      { error: deltaCp < 0 ? 'The party does not have that many coins' : 'Coin total too large', partyCp: campaign.partyCp },
      { status: 400 },
    );
  }
  return NextResponse.json({ partyCp: campaign.partyCp });
}

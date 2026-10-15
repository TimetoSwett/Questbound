export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
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
  publish(id, 'battle');
  return NextResponse.json({ sharedPurse: campaign.sharedPurse });
}

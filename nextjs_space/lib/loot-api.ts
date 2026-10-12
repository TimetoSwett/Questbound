import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserRole } from '@/lib/campaign-helpers';

export async function requireLootGM(campaignId: string) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (await getUserRole(session.user.id, campaignId) !== 'dm') return NextResponse.json({ error: 'Only DM can access loot' }, { status: 403 });
  return null;
}
export const invalidLoot = (message = 'Invalid loot input') => NextResponse.json({ error: message }, { status: 400 });

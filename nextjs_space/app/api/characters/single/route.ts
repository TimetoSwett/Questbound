export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const character = await prisma.character.findUnique({
    where: { id },
    include: { user: { select: { displayName: true } } },
  });
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const isOwner = character.userId === session.user.id;
  const role = character.campaignId ? await getUserRole(session.user.id, character.campaignId) : null;
  if (!isOwner && role !== 'dm') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  return NextResponse.json(character);
}

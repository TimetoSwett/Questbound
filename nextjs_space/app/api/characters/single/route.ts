export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { canAccessCharacter, redactHiddenOwnerIds } from '@/lib/companions';

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
  const role = character.campaignId ? await getUserRole(session.user.id, character.campaignId) : null;
  if (!canAccessCharacter(character, session.user.id, role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  const [visible] = await redactHiddenOwnerIds(prisma, session.user.id, [character]);
  return NextResponse.json(visible);
}

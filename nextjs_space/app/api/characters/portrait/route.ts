export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getFileUrl } from '@/lib/s3';
import { getUserRole } from '@/lib/campaign-helpers';
import { canAccessCharacter } from '@/lib/companions';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const character = await prisma.character.findUnique({ where: { id }, select: { portraitPath: true, portraitIsPublic: true, campaignId: true, userId: true } });
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = character.campaignId ? await getUserRole(session.user.id, character.campaignId) : null;
  if (!canAccessCharacter(character, session.user.id, role)) return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  if (!character.portraitPath) return NextResponse.json({ url: null });
  const url = await getFileUrl(character.portraitPath);
  return NextResponse.json({ url });
}

export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });

  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  // DM sees all characters; player sees only their own
  const where = role === 'dm'
    ? { campaignId }
    : { campaignId, userId: session.user.id };

  const characters = await prisma.character.findMany({
    where,
    include: { user: { select: { displayName: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(characters);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { campaignId, name } = await request.json();
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });

  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });

  const character = await prisma.character.create({
    data: {
      userId: session.user.id,
      campaignId,
      name: name || 'New Character',
      skills: JSON.stringify([]),
      equipment: JSON.stringify([]),
      feats: JSON.stringify([]),
      spells: JSON.stringify({ slots: {}, known: [] }),
    },
  });

  return NextResponse.json(character);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: 'Character id required' }, { status: 400 });

  const character = await prisma.character.findUnique({ where: { id } });
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only owner can edit (or DM for their campaign)
  const role = await getUserRole(session.user.id, character.campaignId);
  if (character.userId !== session.user.id && role !== 'dm') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  // Stringify JSON fields if they are objects
  const jsonFields = ['skills', 'equipment', 'feats', 'spells', 'classes'];
  for (const f of jsonFields) {
    if (data[f] !== undefined && typeof data[f] !== 'string') {
      data[f] = JSON.stringify(data[f]);
    }
  }

  const updated = await prisma.character.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const character = await prisma.character.findUnique({ where: { id } });
  if (!character) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (character.userId !== session.user.id) {
    const role = await getUserRole(session.user.id, character.campaignId);
    if (role !== 'dm') return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
  }

  await prisma.character.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

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

  const where = role === 'dm'
    ? { campaignId }
    : { campaignId, visibility: 'shared' };

  const pages = await prisma.wikiPage.findMany({
    where,
    orderBy: { title: 'asc' },
  });

  return NextResponse.json(pages);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { campaignId, title, category, body, visibility } = await request.json();
  if (!campaignId || !title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });

  const role = await getUserRole(session.user.id, campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM can create wiki pages' }, { status: 403 });

  const page = await prisma.wikiPage.create({
    data: { campaignId, title, category: category || 'Lore', body: body || '', visibility: visibility || 'dm_only' },
  });

  return NextResponse.json(page);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, title, category, body, visibility } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const page = await prisma.wikiPage.findUnique({ where: { id } });
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const role = await getUserRole(session.user.id, page.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM can edit' }, { status: 403 });

  const updated = await prisma.wikiPage.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(category !== undefined && { category }),
      ...(body !== undefined && { body }),
      ...(visibility !== undefined && { visibility }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const page = await prisma.wikiPage.findUnique({ where: { id } });
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const role = await getUserRole(session.user.id, page.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });

  await prisma.wikiPage.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

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
  const where = role === 'dm' ? { campaignId } : { campaignId, visibility: 'shared' };
  const nodes = await prisma.regionNode.findMany({ where, orderBy: { createdAt: 'asc' } });
  return NextResponse.json(nodes);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { campaignId, name, description, nodeType, x, y, visibility } = await request.json();
  const role = await getUserRole(session.user.id, campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });
  const node = await prisma.regionNode.create({
    data: { campaignId, name: name || 'New Location', description: description || '', nodeType: nodeType || 'city', x: x ?? 200, y: y ?? 200, visibility: visibility || 'dm_only' },
  });
  return NextResponse.json(node);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, ...data } = await request.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const node = await prisma.regionNode.findUnique({ where: { id } });
  if (!node) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, node.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });
  const updated = await prisma.regionNode.update({ where: { id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const node = await prisma.regionNode.findUnique({ where: { id } });
  if (!node) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, node.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });
  await prisma.regionEdge.deleteMany({ where: { OR: [{ fromNodeId: id }, { toNodeId: id }] } });
  await prisma.regionNode.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

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
  const edges = await prisma.regionEdge.findMany({
    where: { campaignId },
    include: { fromNode: true, toNode: true },
  });
  // Filter edges if player: only edges between two visible nodes
  if (role !== 'dm') {
    const visibleNodeIds = new Set(
      (await prisma.regionNode.findMany({ where: { campaignId, visibility: 'shared' }, select: { id: true } })).map((n: any) => n.id)
    );
    return NextResponse.json(edges.filter((e: any) => visibleNodeIds.has(e.fromNodeId) && visibleNodeIds.has(e.toNodeId)));
  }
  return NextResponse.json(edges);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { campaignId, fromNodeId, toNodeId, label } = await request.json().catch(() => ({}));
  if (typeof campaignId !== 'string' || !campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });
  // Both ends must be distinct nodes of this campaign; GET includes the full
  // node rows, so a foreign node id would leak another campaign's data.
  if (typeof fromNodeId !== 'string' || typeof toNodeId !== 'string' || fromNodeId === toNodeId) {
    return NextResponse.json({ error: 'Two different nodes required' }, { status: 400 });
  }
  const nodeCount = await prisma.regionNode.count({ where: { campaignId, id: { in: [fromNodeId, toNodeId] } } });
  if (nodeCount !== 2) return NextResponse.json({ error: 'Nodes must belong to this campaign' }, { status: 400 });
  const edge = await prisma.regionEdge.create({
    data: { campaignId, fromNodeId, toNodeId, label: typeof label === 'string' ? label : '' },
  });
  return NextResponse.json(edge);
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const edge = await prisma.regionEdge.findUnique({ where: { id } });
  if (!edge) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const role = await getUserRole(session.user.id, edge.campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });
  await prisma.regionEdge.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

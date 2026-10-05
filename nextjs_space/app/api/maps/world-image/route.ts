export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { getFileUrl } from '@/lib/s3';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get('campaignId');
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 });
  const role = await getUserRole(session.user.id, campaignId);
  if (!role) return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { worldMapImage: true, worldMapImageIsPublic: true } });
  if (!campaign?.worldMapImage) return NextResponse.json({ url: null });
  const url = await getFileUrl(campaign.worldMapImage, 'image/png', campaign.worldMapImageIsPublic);
  return NextResponse.json({ url });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { campaignId, cloud_storage_path, isPublic } = await request.json();
  const role = await getUserRole(session.user.id, campaignId);
  if (role !== 'dm') return NextResponse.json({ error: 'Only DM' }, { status: 403 });
  await prisma.campaign.update({ where: { id: campaignId }, data: { worldMapImage: cloud_storage_path, worldMapImageIsPublic: isPublic ?? true } });
  return NextResponse.json({ ok: true });
}

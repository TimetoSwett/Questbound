import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { TownDetail } from './_components/town-detail';

export default async function TownPage({ params }: { params: Promise<{ id: string; townId: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id, townId } = await params;

  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId: session.user.id ?? '', campaignId: id } },
  });
  if (!membership) redirect('/dashboard');

  // The town must belong to this campaign; hidden towns 404 for players.
  const town = await prisma.town.findUnique({ where: { id: townId }, select: { campaignId: true, revealLevel: true } });
  if (!town || town.campaignId !== id) notFound();
  if (membership.role !== 'dm' && town.revealLevel === 'hidden') notFound();

  return <TownDetail campaignId={id} townId={townId} role={membership.role} />;
}

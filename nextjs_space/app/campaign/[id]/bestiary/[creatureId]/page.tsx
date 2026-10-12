import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { CreatureDetail } from './_components/creature-detail';

export default async function CreaturePage({ params, searchParams }: { params: Promise<{ id: string; creatureId: string }>; searchParams: Promise<{ from?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id, creatureId } = await params;
  const { from } = await searchParams;

  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId: session.user.id ?? '', campaignId: id } },
  });
  if (!membership) redirect('/dashboard');

  // The creature must belong to this campaign; otherwise the role from the URL's
  // campaign would be applied to another campaign's creature.
  const creature = await prisma.creature.findUnique({ where: { id: creatureId }, select: { campaignId: true, revealLevel: true } });
  if (!creature || creature.campaignId !== id) notFound();
  // Hidden creatures 404 for players, same as missing ones.
  if (membership.role !== 'dm' && creature.revealLevel === 'hidden') notFound();

  return <CreatureDetail campaignId={id} creatureId={creatureId} role={membership.role} from={from === 'npcs' ? 'npcs' : 'bestiary'} />;
}

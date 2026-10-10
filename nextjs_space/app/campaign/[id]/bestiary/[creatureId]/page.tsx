import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getUserRole } from '@/lib/campaign-helpers';
import { CreatureDetail } from './_components/creature-detail';

export default async function CreaturePage({ params }: { params: Promise<{ id: string; creatureId: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id, creatureId } = await params;

  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId: session.user.id ?? '', campaignId: id } },
  });
  if (!membership) redirect('/dashboard');

  const role = await getUserRole(session.user.id ?? '', id);
  if (!role) redirect('/dashboard');

  return <CreatureDetail campaignId={id} creatureId={creatureId} role={role} />;
}

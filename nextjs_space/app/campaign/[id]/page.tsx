import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { CampaignShell } from './_components/campaign-shell';

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const { id } = await params;

  const membership = await prisma.campaignMembership.findUnique({
    where: { userId_campaignId: { userId: session.user.id ?? '', campaignId: id } },
  });
  if (!membership) redirect('/dashboard');

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) redirect('/dashboard');

  return (
    <CampaignShell
      campaignId={id}
      campaignName={campaign.name}
      inviteCode={campaign.inviteCode}
      role={membership.role}
      userId={session.user.id ?? ''}
      userName={session.user.name ?? 'Adventurer'}
    />
  );
}

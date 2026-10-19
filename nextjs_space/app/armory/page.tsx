import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { HallClient } from '@/components/library/hall-client';

export default async function ArmoryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <HallClient hall="armory" userName={session.user.name ?? 'Adventurer'} />;
}

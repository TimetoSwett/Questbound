import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { LibraryClient } from './library-client';

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <LibraryClient userName={session.user.name ?? 'Adventurer'} />;
}

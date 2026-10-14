import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/guard';
import { firstAllowedPath } from '@/lib/auth/permissions';

export default async function Home() {
  redirect(firstAllowedPath(await requireUser()));
}

import type { Metadata } from 'next';
import type { SP } from '@/components/qs';
import { requireArea } from '@/lib/auth/guard';
import { ProfitPage } from '../ProfitPage';

export const metadata: Metadata = { title: 'Katalog · Cuan Lens' };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('MARKETPLACE');
  return <ProfitPage kind="kat" sp={await searchParams} />;
}

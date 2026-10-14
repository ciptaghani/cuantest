import { Suspense } from 'react';
import { AreaGate } from '@/components/AreaGate';
import { SubNav } from '@/components/SubNav';

const ITEMS = [
  { href: '/marketing/dashboard', label: 'Dashboard' },
  { href: '/marketing/bcg', label: 'BCG matrix' },
  { href: '/marketing/ads', label: 'Ads' },
  { href: '/marketing/planning', label: 'Schedule & planning' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AreaGate area="MARKETING">
      <Suspense>
        <SubNav items={ITEMS} keep={['store']} />
      </Suspense>
      {children}
    </AreaGate>
  );
}

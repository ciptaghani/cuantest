import { Suspense } from 'react';
import { AreaGate } from '@/components/AreaGate';
import { SubNav } from '@/components/SubNav';
import { MP_KEYS } from './view';

const ITEMS = [
  { href: '/marketplace/ringkasan', label: 'Ringkasan' },
  { href: '/marketplace/katalog', label: 'Katalog' },
  { href: '/marketplace/sku', label: 'Per SKU' },
  { href: '/marketplace/toko', label: 'Per Toko' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AreaGate area="MARKETPLACE">
      <Suspense>
        <SubNav items={ITEMS} keep={MP_KEYS} />
      </Suspense>
      {children}
    </AreaGate>
  );
}

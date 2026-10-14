import { Suspense } from 'react';
import { AreaGate } from '@/components/AreaGate';
import { SubNav } from '@/components/SubNav';

const ITEMS = [
  { href: '/cs/stock', label: 'Info stock' },
  { href: '/cs/info', label: 'Info barang' },
  { href: '/cs/input', label: 'Input info' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AreaGate area="CS">
      <Suspense>
        <SubNav items={ITEMS} keep={['q']} />
      </Suspense>
      {children}
    </AreaGate>
  );
}

import { Suspense } from 'react';
import { AreaGate } from '@/components/AreaGate';
import { SubNav } from '@/components/SubNav';

const ITEMS = [
  { href: '/operasional/task', label: 'Task produksi', group: 'Manufaktur' },
  { href: '/operasional/produksi', label: 'Produksi' },
  { href: '/operasional/keluar-masuk', label: 'Barang keluar masuk' },
  { href: '/operasional/stok', label: 'Stok real-time' },
  { href: '/operasional/umur-stok', label: 'Umur stock' },
  { href: '/operasional/opname', label: 'Stock opname' },
  { href: '/operasional/retur', label: 'Retur', group: 'Operasional' },
  { href: '/operasional/absensi', label: 'Absensi' },
  { href: '/operasional/master', label: 'Master & aturan', group: 'Pengaturan' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AreaGate area="OPS">
      <Suspense>
        <SubNav items={ITEMS} />
      </Suspense>
      {children}
    </AreaGate>
  );
}

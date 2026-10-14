import { Suspense } from 'react';
import { AreaGate } from '@/components/AreaGate';
import { SubNav } from '@/components/SubNav';

const ITEMS = [
  { href: '/finance/pembelian', label: 'Pembelian barang', group: 'Transaksi' },
  { href: '/finance/pembayaran', label: 'Pembayaran' },
  { href: '/finance/pemindahan', label: 'Pemindahan dana' },
  { href: '/finance/restock', label: 'Schedule restock' },
  { href: '/finance/laba-rugi', label: 'Laba rugi', group: 'Laporan' },
  { href: '/finance/arus-kas', label: 'Arus kas' },
  { href: '/finance/buku-besar', label: 'Buku besar' },
  { href: '/finance/settlement', label: 'Settlement' },
  { href: '/finance/pengaturan', label: 'Pengaturan akun', group: 'Pengaturan' },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AreaGate area="FINANCE">
      <Suspense>
        <SubNav items={ITEMS} keep={['from', 'to']} />
      </Suspense>
      {children}
    </AreaGate>
  );
}

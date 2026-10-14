import { ComingSoon } from '@/components/ComingSoon';
import { requireArea } from '@/lib/auth/guard';

export default async function Page() {
  await requireArea('FINANCE');
  return (
    <ComingSoon
      title="Finance"
      phase="Fase 7"
      items={['Pembelian', 'Pembayaran', 'Pemindahan dana', 'Schedule restock', 'Laba rugi', 'Arus kas', 'Buku besar', 'Settlement', 'Pengaturan akun']}
    />
  );
}

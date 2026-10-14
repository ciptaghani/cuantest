import type { Metadata } from 'next';
import type { SP } from '@/components/qs';
import { requireArea } from '@/lib/auth/guard';
import { profitLoss, profitLossRows } from '@/lib/finance';
import { pc } from '@/lib/format';
import { getFinanceInput, getLedger } from '@/lib/repo/finance';
import { ExportLinks, fdate, PeriodBar, periodOf, Report, StatementTable } from '../ui';

export const metadata: Metadata = { title: 'Laba rugi · Cuan Lens' };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('FINANCE');
  const sp = await searchParams;
  const { from, to } = periodOf(sp);
  const [L, fin] = await Promise.all([getLedger(), getFinanceInput()]);
  const pl = profitLoss(L, fin.accounts, from, to);

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">Laba / rugi</h2>
          <p className="sub">
            Tersambung otomatis ke penjualan, fee & affiliate (Marketplace), HPP (Operasional), faktur pembelian, dan pembayaran. Beban iklan diambil dari top up saldo iklan di
            menu Pembayaran. Klik akun untuk lihat buku besarnya.
          </p>
        </div>
        <ExportLinks kind="laba-rugi" from={from} to={to} />
      </div>
      <PeriodBar sp={sp} from={from} to={to} />
      <Report title="Laba/Rugi (Standar)" from={from} to={to}>
        <StatementTable rows={profitLossRows(pl)} head={`${fdate(from)} – ${fdate(to)}`} glHref={(code) => `/finance/buku-besar?acc=${encodeURIComponent(code)}&from=${from}&to=${to}`} />
        <p className="note">Margin laba bersih {pc(pl.margin)}. Penjualan dari toko data contoh di menu Marketplace tidak ikut dihitung.</p>
      </Report>
    </div>
  );
}

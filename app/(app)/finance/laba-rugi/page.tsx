'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadState, useApi } from '@/components/useApi';
import type { SP } from '@/components/qs';
import { profitLoss, profitLossRows } from '@/lib/finance';
import { pc } from '@/lib/format';
import type { FinanceInput, Ledger } from '@/lib/repo/finance';
import { ExportLinks, fdate, PeriodBar, periodOf, Report, StatementTable } from '../ui';

export default function Page() {
  return (
    <Suspense fallback={<p className="note mt-4">Memuat…</p>}>
      <Content />
    </Suspense>
  );
}

function Content() {
  const usp = useSearchParams();
  const sp: SP = Object.fromEntries(usp.entries());
  const { from, to } = periodOf(sp);
  const ledger = useApi<Ledger>('/api/finance/ledger');
  const input = useApi<FinanceInput>('/api/finance/input');
  const loading = ledger.loading || input.loading;
  const error = ledger.error || input.error;
  if (loading || error || !ledger.data || !input.data) return <LoadState loading={loading} error={error} what="laba rugi" />;
  const pl = profitLoss(ledger.data, input.data.accounts, from, to);

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

'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LoadState, useApi } from '@/components/useApi';
import { Kpi } from '@/components/Kpi';
import type { SP } from '@/components/qs';
import { cashFlow, cashFlowRows } from '@/lib/finance';
import { n2, rpS } from '@/lib/format';
import type { FinanceInput, Ledger } from '@/lib/repo/finance';
import { ExportLinks, PeriodBar, periodOf, Report, StatementTable } from '../ui';

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
  if (loading || error || !ledger.data || !input.data) return <LoadState loading={loading} error={error} what="arus kas" />;
  const cf = cashFlow(ledger.data, input.data.accounts, from, to);

  return (
    <div className="panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg">Arus kas</h2>
          <p className="sub">Metode langsung, hanya kas & rekening bank. Saldo marketplace belum dihitung sebagai kas sampai ditarik ke rekening.</p>
        </div>
        <ExportLinks kind="arus-kas" from={from} to={to} />
      </div>
      <PeriodBar sp={sp} from={from} to={to} />
      <div className="kps">
        <Kpi label="Saldo awal kas & bank" value={rpS(cf.open)} />
        <Kpi label="Kas masuk" value={rpS(cf.cashIn)} cls="ok" />
        <Kpi label="Kas keluar" value={rpS(cf.cashOut)} cls="bad" />
        <Kpi label="Saldo akhir kas & bank" value={rpS(cf.end)} />
      </div>
      <Report title="Arus Kas" from={from} to={to}>
        <StatementTable rows={cashFlowRows(cf)} head="Nilai" />
      </Report>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="dh">Per rekening</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Kas/Bank</th>
                  <th className="r">Awal</th>
                  <th className="r">Masuk</th>
                  <th className="r">Keluar</th>
                  <th className="r">Akhir</th>
                </tr>
              </thead>
              <tbody>
                {cf.perAccount.map(({ account: a, row: x }) => (
                  <tr key={a.code}>
                    <td>{a.name}</td>
                    <td className="r">{n2(x.open)}</td>
                    <td className="r">{n2(x.d)}</td>
                    <td className="r">{n2(x.c)}</td>
                    <td className="r font-semibold">{n2(x.end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="dh">Dana belum jadi kas</h3>
          <div className="tbl-wrap">
            <table className="tbl">
              <tbody>
                {cf.wallets.map(({ account: a, end }) => (
                  <tr key={a.code}>
                    <td>{a.name}</td>
                    <td className="r">{n2(end)}</td>
                  </tr>
                ))}
                {!cf.wallets.length && (
                  <tr>
                    <td className="text-muted">Belum ada toko.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

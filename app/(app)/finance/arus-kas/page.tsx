import type { Metadata } from 'next';
import { Kpi } from '@/components/Kpi';
import type { SP } from '@/components/qs';
import { requireArea } from '@/lib/auth/guard';
import { cashFlow, cashFlowRows } from '@/lib/finance';
import { n2, rpS } from '@/lib/format';
import { getFinanceInput, getLedger } from '@/lib/repo/finance';
import { ExportLinks, PeriodBar, periodOf, Report, StatementTable } from '../ui';

export const metadata: Metadata = { title: 'Arus kas · Cuan Lens' };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('FINANCE');
  const sp = await searchParams;
  const { from, to } = periodOf(sp);
  const [L, fin] = await Promise.all([getLedger(), getFinanceInput()]);
  const cf = cashFlow(L, fin.accounts, from, to);

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

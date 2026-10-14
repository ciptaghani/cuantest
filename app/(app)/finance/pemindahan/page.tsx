import type { Metadata } from 'next';
import Link from 'next/link';
import { ActBtn } from '@/components/ActBtn';
import { Kpi } from '@/components/Kpi';
import type { SP } from '@/components/qs';
import { requireArea } from '@/lib/auth/guard';
import { accountName, chartOfAccounts, glAgg } from '@/lib/finance';
import { rp, rpS } from '@/lib/format';
import { getFinanceInput, getLedger } from '@/lib/repo/finance';
import { AddForm } from '../../operasional/inputs';
import { deleteTransfer, saveTransfer } from '../actions';
import { fdate, periodOf } from '../ui';

export const metadata: Metadata = { title: 'Pemindahan dana · Cuan Lens' };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireArea('FINANCE');
  const { today } = periodOf(await searchParams);
  const [L, fin] = await Promise.all([getLedger(), getFinanceInput()]);
  const { list: accs, map } = chartOfAccounts(fin.accounts);
  const A = glAgg(L, '0000-00-00', today);
  const bal = (code: string) => (A[code] ? A[code].end : 0);
  const wallets = accs.filter((a) => a.isWallet);
  const cash = accs.filter((a) => a.isCash);
  const list = [...fin.transfers].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="panel self-start">
        <h2 className="text-lg">Pemindahan dana</h2>
        <p className="sub">Tarik saldo marketplace ke rekening bank, atau pindah antar kas/bank.</p>
        {!fin.accounts.some((a) => a.isBank) && (
          <p className="alert mid mt-3">
            Belum ada rekening bank. <Link href="/finance/pengaturan">Daftarkan rekening</Link> di Pengaturan akun.
          </p>
        )}
        <div className="kps">
          {wallets.map((w) => (
            <Kpi key={w.code} label={w.name} value={rpS(bal(w.code))} cls={bal(w.code) < 0 ? 'bad' : ''} />
          ))}
          {!wallets.length && <Kpi label="Saldo marketplace" value="–" />}
        </div>
        <p className="note">Saldo marketplace = penjualan bersih (setelah fee & affiliate) dari menu Marketplace dikurangi penarikan.</p>
        <AddForm
          action={saveTransfer}
          ghost={false}
          submit="Simpan pemindahan"
          fields={[
            { name: 'date', label: 'Tanggal', type: 'date', defaultValue: today, required: true },
            { name: 'from', label: 'Dari', type: 'select', grow: true, options: [['', 'Pilih sumber'], ...[...wallets, ...cash].map((a): [string, string] => [a.code, `${a.name} · saldo ${rp(bal(a.code))}`])] },
            { name: 'to', label: 'Ke', type: 'select', grow: true, options: [['', 'Pilih kas/bank'], ...cash.map((a): [string, string] => [a.code, a.name])] },
            { name: 'amount', label: 'Jumlah diterima', type: 'number', width: 140, required: true },
            { name: 'fee', label: 'Biaya penarikan/transfer', type: 'number', width: 140 },
            { name: 'note', label: 'Catatan', grow: true },
          ]}
        />
      </div>
      <div className="panel">
        <h2 className="text-lg">Riwayat pemindahan</h2>
        <div className="tbl-wrap mt-3">
          <table className="tbl">
            <thead>
              <tr>
                <th>Tanggal</th>
                <th>No.</th>
                <th>Dari</th>
                <th>Ke</th>
                <th className="r">Jumlah</th>
                <th className="r">Biaya</th>
                <th>Oleh</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id}>
                  <td>{fdate(x.date)}</td>
                  <td>
                    <b>{x.number}</b>
                    {x.note && <div className="ps">{x.note}</div>}
                  </td>
                  <td>{accountName(map, x.from)}</td>
                  <td>{accountName(map, x.to)}</td>
                  <td className="r">{rp(x.amount)}</td>
                  <td className="r">{rp(x.fee)}</td>
                  <td>{x.by}</td>
                  <td>
                    <ActBtn action={deleteTransfer} input={{ id: x.id }} confirm={`Hapus pemindahan ${x.number}?`}>
                      Hapus
                    </ActBtn>
                  </td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td colSpan={8} className="text-muted">
                    Belum ada pemindahan dana.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

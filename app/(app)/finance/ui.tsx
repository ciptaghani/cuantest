'use client';

import Link from 'next/link';
import { AutoForm } from '@/components/AutoForm';
import { one, qs, type SP } from '@/components/qs';
import { addDays, isValidDateKey, todayKey } from '@/lib/date';
import type { FinAccount, StatementRow } from '@/lib/finance';
import { n2 } from '@/lib/format';
import { fdate } from '../operasional/ui';
import { PrintBtn } from './PrintBtn';
import { backendUrl } from '@/lib/api';

export { fdate };

/** Periode laporan dari URL `from`/`to` (default bulan ini, sama dengan finRange di HTML). */
export function periodOf(sp: SP) {
  const today = todayKey();
  const from = isValidDateKey(one(sp, 'from')) ? one(sp, 'from') : today.slice(0, 8) + '01';
  const to = isValidDateKey(one(sp, 'to')) ? one(sp, 'to') : today;
  return { today, from, to };
}

/** Dari/sampai + pilihan cepat Bulan ini / Bulan lalu / Tahun ini. */
export function PeriodBar({ sp, from, to, children }: { sp: SP; from: string; to: string; children?: React.ReactNode }) {
  const t = todayKey();
  const thisMonth = t.slice(0, 8) + '01';
  const lastEnd = addDays(thisMonth, -1);
  const presets: [string, string, string][] = [
    ['Bulan ini', thisMonth, t],
    ['Bulan lalu', lastEnd.slice(0, 8) + '01', lastEnd],
    ['Tahun ini', t.slice(0, 5) + '01-01', t],
  ];
  return (
    <AutoForm>
      <label className="field">
        <span>Dari</span>
        <input type="date" name="from" defaultValue={from} />
      </label>
      <label className="field">
        <span>Sampai</span>
        <input type="date" name="to" defaultValue={to} />
      </label>
      <div className="field">
        <span>Periode</span>
        <div className="seg">
          {presets.map(([label, f, tt]) => (
            <Link key={label} href={qs(sp, { from: f, to: tt })} scroll={false} aria-current={from === f && to === tt ? 'page' : undefined}>
              {label}
            </Link>
          ))}
        </div>
      </div>
      {children}
    </AutoForm>
  );
}

/** Label akun di pilihan: rekening & saldo toko pakai nama, lainnya "kode · nama". */
export const accLabel = (a: Pick<FinAccount, 'code' | 'name' | 'isBank' | 'isWallet'>) => (a.isBank || a.isWallet ? a.name : `${a.code} · ${a.name}`);

export const accOptions = (accounts: FinAccount[], filter: (a: FinAccount) => boolean): [string, string][] => accounts.filter(filter).map((a) => [a.code, accLabel(a)]);

/** Laporan gaya Accurate: judul tengah + tabel. */
export function Report({ title, from, to, children }: { title: string; from: string; to: string; children: React.ReactNode }) {
  return (
    <div className="report">
      <div className="rep-h">
        <h2>{title}</h2>
        <div className="sub">
          Dari {fdate(from)} s/d {fdate(to)}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Tabel laporan (laba rugi, arus kas). Baris akun jadi link ke buku besarnya kalau `glHref` diisi. */
export function StatementTable({ rows, head, glHref }: { rows: StatementRow[]; head: string; glHref?: (code: string) => string }) {
  const pad = ['0px', '16px', '32px'];
  return (
    <table className="pl">
      <thead>
        <tr>
          <th className="text-left">Deskripsi</th>
          <th className="r">{head}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={r.kind === 'h' ? 'plh' : r.kind === 'tot' ? 'pltot' : r.kind === 'big' ? `pltot big ${r.label === 'LABA BERSIH' ? ((r.value ?? 0) < 0 ? 'neg' : 'pos') : ''}` : r.code ? 'plrow' : ''}>
            <td style={{ paddingLeft: `calc(8px + ${pad[r.level]})` }} className={r.kind === 'g' ? 'font-semibold' : r.label === 'Tidak ada' ? 'text-muted' : ''}>
              {r.code && glHref ? <Link href={glHref(r.code)}>{r.label}</Link> : r.label}
            </td>
            <td className={`r ${r.kind === 'row' && (r.value ?? 0) < 0 ? 'neg' : ''}`}>{r.value === null ? '' : n2(r.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Download Excel laporan untuk periode yang sama + cetak / PDF. */
export function ExportLinks({ kind, from, to }: { kind: string; from: string; to: string }) {
  return (
    <div className="no-print flex flex-wrap gap-2">
      <a className="btn-ghost btn-sm" href={backendUrl(`/api/export/${kind}?from=${from}&to=${to}`)}>
        Download Excel
      </a>
      <PrintBtn />
    </div>
  );
}

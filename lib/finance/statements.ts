import type { DateKey } from '@/lib/date';
import { chartOfAccounts } from './coa';
import { balanceSign, glAgg } from './ledger';
import type { CashFlow, PlSection, ProfitLoss } from './reports';
import { ACCOUNT_TYPE_LABEL, type FinAccount, type Ledger } from './types';

/**
 * Baris laporan siap tampil, dipakai halaman dan export Excel supaya isinya sama.
 * h = judul bagian, g = judul grup, row = akun/pos, tot = jumlah, big = total utama.
 */
export interface StatementRow {
  kind: 'h' | 'g' | 'row' | 'tot' | 'big';
  label: string;
  value: number | null;
  /** Kode akun (baris yang bisa dibuka di buku besar). */
  code?: string;
  /** Tingkat indentasi 0–2. */
  level: number;
}

function section(s: PlSection): StatementRow[] {
  const out: StatementRow[] = [];
  for (const g of s.groups) {
    out.push({ kind: 'g', label: g.name, value: g.total, level: 1 });
    for (const a of g.accounts) out.push({ kind: 'row', label: a.name, value: a.value, code: a.code, level: 2 });
  }
  for (const a of s.solo) out.push({ kind: 'row', label: a.name, value: a.value, code: a.code, level: 1 });
  return out;
}

/** Laba/Rugi (Standar) seperti fnPL di HTML. */
export function profitLossRows(pl: ProfitLoss): StatementRow[] {
  const h = (label: string): StatementRow => ({ kind: 'h', label, value: null, level: 0 });
  const tot = (label: string, value: number, kind: 'tot' | 'big' = 'tot'): StatementRow => ({ kind, label, value, level: 0 });
  return [
    h('PENDAPATAN'),
    ...section(pl.revenue),
    tot('Jumlah Pendapatan', pl.revenue.total),
    h('BEBAN POKOK PENJUALAN'),
    ...section(pl.cogs),
    tot('Jumlah Beban Pokok Penjualan', pl.cogs.total),
    tot('LABA KOTOR', pl.grossProfit, 'big'),
    h('BEBAN OPERASIONAL'),
    ...section(pl.expense),
    tot('Jumlah Beban Operasional', pl.expense.total),
    tot('PENDAPATAN OPERASIONAL', pl.operatingProfit, 'big'),
    h('PENDAPATAN DAN BEBAN NON OPERASIONAL'),
    { kind: 'g', label: 'Pendapatan Non Operasional', value: null, level: 0 },
    ...section(pl.otherIncome),
    tot('Jumlah Pendapatan Non Operasional', pl.otherIncome.total),
    { kind: 'g', label: 'Beban Non Operasional', value: null, level: 0 },
    ...section(pl.otherExpense),
    tot('Jumlah Beban Non Operasional', pl.otherExpense.total),
    tot('Jumlah Pendapatan dan Beban Non Operasional', pl.nonOperating),
    tot('LABA BERSIH', pl.netProfit, 'big'),
  ];
}

/** Arus kas metode langsung seperti fnCF di HTML. */
export function cashFlowRows(cf: CashFlow): StatementRow[] {
  const out: StatementRow[] = [{ kind: 'tot', label: 'Saldo awal kas & bank', value: cf.open, level: 0 }];
  const titles = { op: 'Aktivitas operasi', inv: 'Aktivitas investasi', fin: 'Aktivitas pendanaan' } as const;
  for (const k of ['op', 'inv', 'fin'] as const) {
    out.push({ kind: 'h', label: titles[k], value: null, level: 0 });
    const s = cf.sections[k];
    if (!s.rows.length) out.push({ kind: 'row', label: 'Tidak ada', value: null, level: 1 });
    for (const [label, value] of s.rows) out.push({ kind: 'row', label, value, level: 1 });
    out.push({ kind: 'tot', label: `Arus kas bersih ${titles[k].toLowerCase()}`, value: s.total, level: 0 });
  }
  if (Math.abs(cf.drift) > 0.5) out.push({ kind: 'row', label: 'Mutasi kas lain', value: cf.drift, level: 0 });
  out.push({ kind: 'big', label: 'Kenaikan (penurunan) kas', value: cf.end - cf.open, level: 0 });
  out.push({ kind: 'big', label: 'Saldo akhir kas & bank', value: cf.end, level: 0 });
  return out;
}

export interface GlSummaryRow {
  account: FinAccount;
  /** Saldo dengan tanda saldo normal akun (positif = normal). */
  open: number;
  d: number;
  c: number;
  end: number;
  /** Judul tipe akun sebelum baris ini (baris pertama tiap tipe). */
  typeHead: string | null;
}

/** Ringkasan buku besar (fnGL): akun yang punya saldo atau mutasi, dikelompokkan per tipe. */
export function glSummary(L: Ledger, accounts: FinAccount[], from: DateKey, to: DateKey): { rows: GlSummaryRow[]; debit: number; credit: number; balanced: boolean } {
  const A = glAgg(L, from, to);
  const { list, map } = chartOfAccounts(accounts);
  const rows: GlSummaryRow[] = [];
  let debit = 0;
  let credit = 0;
  let lastType = '';
  for (const a of list) {
    const x = A[a.code];
    if (!x || !(Math.abs(x.open) > 0.5 || x.d || x.c)) continue;
    const s = balanceSign(map, a.code);
    debit += x.d;
    credit += x.c;
    rows.push({ account: a, open: x.open * s, d: x.d, c: x.c, end: x.end * s, typeHead: a.type !== lastType ? ACCOUNT_TYPE_LABEL[a.type] : null });
    lastType = a.type;
  }
  return { rows, debit, credit, balanced: Math.abs(debit - credit) < 1 };
}

export interface GlDetailRow {
  date: DateKey;
  ref: string;
  desc: string;
  d: number;
  c: number;
  /** Saldo berjalan dengan tanda saldo normal. */
  balance: number;
}

/** Rincian satu akun dalam periode (detail buku besar). */
export function glDetail(L: Ledger, code: string, from: DateKey, to: DateKey): { open: number; rows: GlDetailRow[] } {
  const x = glAgg(L, from, to)[code];
  const s = balanceSign(L.accounts, code);
  let run = x ? x.open : 0;
  const rows: GlDetailRow[] = [];
  for (const e of L.entries) {
    if (e.date < from || e.date > to || e.kind === 'open') continue;
    for (const l of e.lines)
      if (l.acc === code) {
        run += l.d - l.c;
        rows.push({ date: e.date, ref: e.ref, desc: e.desc, d: l.d, c: l.c, balance: run * s });
      }
  }
  return { open: (x ? x.open : 0) * s, rows };
}

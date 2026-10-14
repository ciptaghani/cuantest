import type { DateKey } from '@/lib/date';
import { chartOfAccounts } from './coa';
import { glAgg, type GlRow } from './ledger';
import { DEBIT_TYPES, type AccountType, type CashflowCategory, type FinAccount, type Ledger } from './types';

export interface PlLine {
  code: string;
  name: string;
  value: number;
}

export interface PlSection {
  groups: { name: string; total: number; accounts: PlLine[] }[];
  solo: PlLine[];
  total: number;
}

export interface ProfitLoss {
  revenue: PlSection;
  cogs: PlSection;
  expense: PlSection;
  otherIncome: PlSection;
  otherExpense: PlSection;
  grossProfit: number;
  operatingProfit: number;
  nonOperating: number;
  netProfit: number;
  /** Laba bersih ÷ pendapatan. */
  margin: number;
}

/** Laba rugi (format standar seperti Accurate) dari buku besar. */
export function profitLoss(L: Ledger, accounts: FinAccount[], from: DateKey, to: DateKey): ProfitLoss {
  const A = glAgg(L, from, to);
  const { list, map } = chartOfAccounts(accounts);
  const val = (code: string) => {
    const x = A[code];
    if (!x) return 0;
    return map[code] && DEBIT_TYPES.has(map[code].type) ? x.d - x.c : x.c - x.d;
  };
  const sect = (type: AccountType): PlSection => {
    const accs = list.filter((a) => a.type === type && Math.abs(val(a.code)) > 0.5);
    const grp: Record<string, PlLine[]> = {};
    const solo: PlLine[] = [];
    for (const a of accs) {
      const line = { code: a.code, name: a.name, value: val(a.code) };
      if (a.group) (grp[a.group] ||= []).push(line);
      else solo.push(line);
    }
    return {
      groups: Object.entries(grp).map(([name, ls]) => ({ name, total: ls.reduce((s, l) => s + l.value, 0), accounts: ls })),
      solo,
      total: accs.reduce((s, a) => s + val(a.code), 0),
    };
  };
  const revenue = sect('REVENUE');
  const cogs = sect('COGS');
  const expense = sect('EXPENSE');
  const otherIncome = sect('OTHER_INCOME');
  const otherExpense = sect('OTHER_EXPENSE');
  const grossProfit = revenue.total - cogs.total;
  const operatingProfit = grossProfit - expense.total;
  const nonOperating = otherIncome.total - otherExpense.total;
  const netProfit = operatingProfit + nonOperating;
  return {
    revenue,
    cogs,
    expense,
    otherIncome,
    otherExpense,
    grossProfit,
    operatingProfit,
    nonOperating,
    netProfit,
    margin: revenue.total ? netProfit / revenue.total : NaN,
  };
}

export interface CashFlow {
  open: number;
  end: number;
  sections: Record<CashflowCategory, { rows: [string, number][]; total: number }>;
  /** Mutasi kas yang tidak tercatat sebagai arus kas (seharusnya 0). */
  drift: number;
  cashIn: number;
  cashOut: number;
  perAccount: { account: FinAccount; row: GlRow }[];
  wallets: { account: FinAccount; end: number }[];
}

/** Arus kas metode langsung (hanya kas & bank; saldo marketplace belum dianggap kas). */
export function cashFlow(L: Ledger, accounts: FinAccount[], from: DateKey, to: DateKey): CashFlow {
  const { list } = chartOfAccounts(accounts);
  const cash = list.filter((a) => a.isCash);
  const A = glAgg(L, from, to);
  const open = cash.reduce((s, a) => s + (A[a.code] ? A[a.code].open : 0), 0);
  const end = cash.reduce((s, a) => s + (A[a.code] ? A[a.code].end : 0), 0);
  const cat: Record<CashflowCategory, Record<string, number>> = { op: {}, inv: {}, fin: {} };
  for (const e of L.entries) {
    if (e.date < from || e.date > to || e.kind === 'open') continue;
    for (const f of e.cf) {
      if (Math.abs(f.amt) < 0.5) continue;
      cat[f.cat][f.label] = (cat[f.cat][f.label] || 0) + f.amt;
    }
  }
  const sec = (k: CashflowCategory) => {
    const rows = Object.entries(cat[k]).sort((a, b) => b[1] - a[1]);
    return { rows, total: rows.reduce((s, r) => s + r[1], 0) };
  };
  const sections = { op: sec('op'), inv: sec('inv'), fin: sec('fin') };
  const all = Object.values(cat).flatMap((o) => Object.values(o));
  const zero: GlRow = { open: 0, d: 0, c: 0, end: 0 };
  return {
    open,
    end,
    sections,
    drift: end - (open + sections.op.total + sections.inv.total + sections.fin.total),
    cashIn: all.filter((v) => v > 0).reduce((a, b) => a + b, 0),
    cashOut: -all.filter((v) => v < 0).reduce((a, b) => a + b, 0),
    perAccount: cash.map((a) => ({ account: a, row: A[a.code] || zero })),
    wallets: list.filter((a) => a.isWallet).map((a) => ({ account: a, end: A[a.code] ? A[a.code].end : 0 })),
  };
}

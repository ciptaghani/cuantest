import type { DateKey } from '@/lib/date';
import { enrich } from '@/lib/marketplace/compute';
import type { StoreRate } from '@/lib/marketplace/fees';
import type { MarketplaceData, Store } from '@/lib/marketplace/types';
import { accountName, chartOfAccounts } from './coa';
import { invTotals } from './invoice';
import {
  ACC,
  DEBIT_TYPES,
  type CashflowItem,
  type EntryKind,
  type FinAccount,
  type Ledger,
  type LedgerEntry,
  type LedgerLine,
  type Payment,
  type PurchaseDoc,
  type Transfer,
} from './types';

const r0 = (x: number) => Math.round((+x || 0) * 100) / 100;

export interface LedgerInput {
  /** Tanggal mulai pembukuan. */
  start: DateKey;
  accounts: FinAccount[];
  /** Saldo awal per kode akun (nilai positif = saldo normal). */
  opening: Record<string, number>;
  /** Data Marketplace (toko demo dilewati). */
  marketplace: MarketplaceData;
  rates: Record<string, StoreRate>;
  /** storeId → kode akun saldo toko. */
  walletOf: Record<string, string>;
  invoices: PurchaseDoc[];
  payments: Payment[];
  transfers: Transfer[];
}

/**
 * Bangkitkan jurnal double-entry dari data sumber (tidak disimpan ganda).
 * Beban iklan HANYA dari top up saldo iklan; laporan iklan marketplace tidak masuk.
 */
export function buildLedger(input: LedgerInput): Ledger {
  const { start } = input;
  const { map } = chartOfAccounts(input.accounts);
  const E: LedgerEntry[] = [];
  const add = (date: DateKey, ref: string, kind: EntryKind, desc: string, raw: Partial<LedgerLine>[], cf: CashflowItem[] = []) => {
    const lines = raw
      .filter((l) => l.acc && (Math.abs(l.d || 0) > 0.004 || Math.abs(l.c || 0) > 0.004))
      .map((l) => ({ acc: l.acc as string, d: r0(l.d || 0), c: r0(l.c || 0) }));
    if (!lines.length) return;
    // Pembulatan sen per baris bisa membuat jurnal selisih beberapa sen; taruh selisihnya di baris terbesar
    // supaya total debit = total kredit selalu tepat.
    const diff = r0(lines.reduce((s, l) => s + l.d - l.c, 0));
    if (diff && Math.abs(diff) < 0.05) {
      const big = lines.reduce((b, l) => (Math.max(l.d, l.c) > Math.max(b.d, b.c) ? l : b));
      if (big.c >= big.d) big.c = r0(big.c + diff);
      else big.d = r0(big.d - diff);
    }
    E.push({ date, ref, kind, desc, lines, cf });
  };

  // saldo awal
  const ol: Partial<LedgerLine>[] = [];
  let eq = 0;
  for (const a in input.opening) {
    const v = +input.opening[a] || 0;
    if (!v || !map[a]) continue;
    if (DEBIT_TYPES.has(map[a].type)) {
      ol.push({ acc: a, d: v });
      eq += v;
    } else {
      ol.push({ acc: a, c: v });
      eq -= v;
    }
  }
  if (eq) ol.push({ acc: ACC.openingEquity, d: eq < 0 ? -eq : 0, c: eq > 0 ? eq : 0 });
  add(start, 'SALDO-AWAL', 'open', 'Saldo awal pembukuan', ol);

  // penjualan per hari per toko
  const mp = input.marketplace;
  const realStores = mp.stores.filter((s) => !s.isDemo);
  const ids = new Set(realStores.map((s) => s.id));
  const sm: Record<string, Store> = Object.fromEntries(mp.stores.map((s) => [s.id, s]));
  const day: Record<string, { om: number; hpp: number; mp: number; ams: number; n: Set<string> }> = {};
  const lines = enrich(
    mp.orders.filter((o) => ids.has(o.storeId) && o.ts.slice(0, 10) >= start),
    mp,
    input.rates,
  );
  for (const l of lines) {
    const k = l.ts.slice(0, 10) + '|' + l.storeId;
    const g = (day[k] ||= { om: 0, hpp: 0, mp: 0, ams: 0, n: new Set() });
    g.om += l.subtotal;
    g.hpp += l.hpp;
    g.mp += l.mp;
    g.ams += l.ams;
    g.n.add(l.orderNo);
  }
  for (const k in day) {
    const [d, sid] = k.split('|');
    const g = day[k];
    const s = sm[sid];
    const tiktok = s.channel === 'tiktok';
    add(d, 'JUAL ' + d.slice(5) + ' ' + s.name, 'sale', `Penjualan ${s.name} · ${g.n.size} pesanan`, [
      { acc: input.walletOf[sid], d: g.om - g.mp - g.ams },
      { acc: tiktok ? ACC.feeTiktok : ACC.feeShopee, d: g.mp },
      { acc: tiktok ? ACC.affTiktok : ACC.affShopee, d: g.ams },
      { acc: ACC.sales, c: g.om },
      { acc: ACC.cogs, d: g.hpp },
      { acc: ACC.inventory, c: g.hpp },
    ]);
  }

  // faktur pembelian
  for (const v of input.invoices) {
    if (!v.date || v.date < start) continue;
    const t = invTotals(v);
    const dl: Record<string, number> = {};
    for (const l of t.lines) {
      const a = l.kind === 'SKU' ? ACC.inventory : l.account || ACC.officeSupplies;
      dl[a] = (dl[a] || 0) + l.net;
    }
    if (+v.extra) dl[ACC.inventory] = (dl[ACC.inventory] || 0) + +v.extra;
    add(v.date, v.number, 'inv', 'Faktur pembelian · ' + (v.supplier || ''), [...Object.entries(dl).map(([acc, x]) => ({ acc, d: x })), { acc: ACC.payable, c: t.total }]);
  }

  // pembayaran
  const invs: Record<string, PurchaseDoc> = {};
  for (const v of input.invoices) invs[v.id] = v;
  for (const p of input.payments) {
    if (!p.date || p.date < start) continue;
    const amt = +p.amount || 0;
    const bank = p.bank || ACC.cash;
    if (p.kind === 'EXPENSE') {
      const tot = p.lines.reduce((a, l) => a + (+l.amount || 0), 0);
      add(
        p.date,
        p.number,
        'pay',
        'Pembayaran beban' + (p.note ? ' · ' + p.note : ''),
        [...p.lines.map((l) => ({ acc: l.account, d: +l.amount || 0 })), { acc: bank, c: amt }, { acc: ACC.expensePayable, c: tot - amt }],
        p.lines.map((l) => {
          const a = map[l.account];
          return { cat: a?.isInvest ? 'inv' : 'op', label: a?.name || l.account, amt: -(tot ? (amt * (+l.amount || 0)) / tot : 0) };
        }),
      );
    } else if (p.kind === 'EXPENSE_REMAINDER') {
      add(p.date, p.number, 'pay', 'Pelunasan sisa beban', [{ acc: ACC.expensePayable, d: amt }, { acc: bank, c: amt }], [{ cat: 'op', label: 'Pelunasan utang beban', amt: -amt }]);
    } else if (p.kind === 'INVOICE') {
      const v = p.invoiceId ? invs[p.invoiceId] : undefined;
      let inv = 0;
      if (v) {
        const t = invTotals(v);
        inv = t.total ? t.lines.filter((l) => l.kind !== 'SKU' && l.account && map[l.account]?.isInvest).reduce((a, l) => a + l.net, 0) / t.total : 0;
      }
      add(
        p.date,
        p.number,
        'pay',
        'Pembayaran faktur ' + (v ? v.number + ' · ' + v.supplier : ''),
        [{ acc: ACC.payable, d: amt }, { acc: bank, c: amt }],
        [
          { cat: 'op', label: 'Pembayaran ke pemasok', amt: -amt * (1 - inv) },
          { cat: 'inv', label: 'Pembelian peralatan', amt: -amt * inv },
        ],
      );
    } else if (p.kind === 'ADS_TOPUP') {
      add(
        p.date,
        p.number,
        'pay',
        'Top up saldo iklan ' + (p.channel || ''),
        [{ acc: p.account || ACC.adsOther, d: amt }, { acc: bank, c: amt }],
        [{ cat: 'op', label: 'Top up saldo iklan', amt: -amt }],
      );
    } else if (p.kind === 'RECEIPT') {
      const a = p.account ? map[p.account] : undefined;
      add(
        p.date,
        p.number,
        'pay',
        'Penerimaan · ' + (a?.name || '') + (p.note ? ' · ' + p.note : ''),
        [{ acc: bank, d: amt }, { acc: p.account || undefined, c: amt }],
        [{ cat: a?.type === 'EQUITY' ? 'fin' : 'op', label: a?.name || 'Penerimaan lain', amt }],
      );
    }
  }

  // pemindahan dana
  for (const x of input.transfers) {
    if (!x.date || x.date < start) continue;
    const amt = +x.amount || 0;
    const fee = +x.fee || 0;
    const fa = map[x.from];
    const ta = map[x.to];
    const cf: CashflowItem[] = [];
    if (fa?.isWallet && ta?.isCash) cf.push({ cat: 'op', label: 'Penerimaan penjualan marketplace', amt });
    if (fee && fa?.isCash) cf.push({ cat: 'op', label: 'Biaya transfer', amt: -fee });
    if (fa?.isCash && !ta?.isCash) cf.push({ cat: 'op', label: 'Pindah ke ' + (ta?.name || ''), amt: -amt });
    add(x.date, x.number, 'xfer', `Pemindahan dana ${accountName(map, x.from)} → ${accountName(map, x.to)}`, [{ acc: x.to, d: amt }, { acc: ACC.bankAdmin, d: fee }, { acc: x.from, c: amt + fee }], cf);
  }

  E.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === 'open' ? -1 : b.kind === 'open' ? 1 : 0));
  return { entries: E, accounts: map, start };
}

export interface GlRow {
  /** Saldo awal (debit − kredit). */
  open: number;
  d: number;
  c: number;
  end: number;
}

/** Saldo awal, mutasi, dan saldo akhir tiap akun dalam periode. */
export function glAgg(L: Ledger, from: DateKey, to: DateKey): Record<string, GlRow> {
  const A: Record<string, GlRow> = {};
  const g = (a: string) => (A[a] ||= { open: 0, d: 0, c: 0, end: 0 });
  for (const e of L.entries) {
    if (e.date > to) continue;
    for (const l of e.lines) {
      const x = g(l.acc);
      if (e.date < from || e.kind === 'open') x.open += l.d - l.c;
      else {
        x.d += l.d;
        x.c += l.c;
      }
    }
  }
  for (const a in A) {
    const x = A[a];
    x.end = x.open + x.d - x.c;
  }
  return A;
}

/** +1 untuk akun bersaldo normal debit, −1 untuk kredit. */
export const balanceSign = (map: Record<string, FinAccount>, code: string) => (map[code] && DEBIT_TYPES.has(map[code].type) ? 1 : -1);

/** Total debit & kredit seluruh jurnal. Harus selalu sama. */
export function trialBalance(L: Ledger): { debit: number; credit: number; balanced: boolean } {
  let debit = 0;
  let credit = 0;
  for (const e of L.entries)
    for (const l of e.lines) {
      debit += l.d;
      credit += l.c;
    }
  return { debit, credit, balanced: Math.abs(debit - credit) < 1 };
}

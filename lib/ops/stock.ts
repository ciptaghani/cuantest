import type { DateKey } from '@/lib/date';
import type { OpsModel } from './model';
import type { Opname } from './types';

export interface StockRow {
  /** Hitung fisik opname dasar. */
  base: number;
  /** Produksi / geser / barang masuk / pindah masuk. */
  in: number;
  /** Botol sumber terpakai. */
  use: number;
  sold: number;
  /** Barang keluar / pindah keluar. */
  out: number;
  now: number;
}

const blank = (): StockRow => ({ base: 0, in: 0, use: 0, sold: 0, out: 0, now: 0 });

export interface WarehouseStock {
  base: Opname | undefined;
  /** Tanggal opname dasar ('0000-00-00' kalau belum ada). */
  baseDate: DateKey;
  st: Record<string, StockRow>;
}

/**
 * Stok satu gudang = opname final terakhir + masuk − terpakai − terjual − keluar.
 * Transaksi di tanggal opname dianggap sudah termasuk hitungan fisik.
 * `at` (opsional): stok per akhir tanggal sebelum `at`-nya opname, dengan transaksi s.d. `at`.
 */
export function stockCalcWh(m: OpsModel, wh: string, at?: DateKey): WarehouseStock {
  const finals = m.opnames.filter((o) => o.final && o.warehouseId === wh);
  const base = at ? finals.filter((o) => o.date < at).pop() : finals.filter((o) => o.date <= m.today).pop();
  const B = base ? base.date : '0000-00-00';
  const until = at || '9999-12-31';
  const st: Record<string, StockRow> = {};
  const g = (s: string) => (st[s] ||= blank());
  if (base)
    for (const s in base.counts) {
      const v = base.counts[s];
      if (v !== null && v !== undefined) g(s).base = +v;
    }
  for (const e of m.movements) {
    if (e.date <= B || e.date > until) continue;
    if (e.type === 'TRANSFER') {
      for (const o of e.lines) {
        if (!o.sku) continue;
        if (e.warehouseId === wh) g(o.sku).out += +o.qty || 0;
        if (e.toWarehouseId === wh) g(o.sku).in += +o.qty || 0;
      }
      continue;
    }
    if (e.warehouseId !== wh) continue;
    if (e.type === 'OUT') {
      for (const o of e.lines) if (o.sku) g(o.sku).out += +o.qty || 0;
      continue;
    }
    if (e.sourceSku && +e.sourceQty) g(e.sourceSku).use += +e.sourceQty;
    for (const o of e.lines) if (o.sku) g(o.sku).in += +o.qty || 0;
  }
  if (wh === m.config.salesWarehouseId)
    for (const d in m.sales) {
      if (d <= B || d > until) continue;
      const r = m.sales[d].rows;
      for (const s in r) g(s).sold += +r[s] || 0;
    }
  for (const s in st) {
    const x = st[s];
    x.now = x.base + x.in - x.use - x.sold - x.out;
  }
  return { base, baseDate: B, st };
}

export interface StockResult {
  /** Total gudang terpilih. */
  st: Record<string, StockRow>;
  per: Record<string, Record<string, StockRow>>;
  bases: Record<string, Opname | undefined>;
  base: Opname | undefined | null;
}

/** Stok gabungan beberapa gudang (default semua gudang). */
export function stockCalc(m: OpsModel, at?: DateKey, warehouseIds?: string[]): StockResult {
  const whs = warehouseIds && warehouseIds.length ? warehouseIds : m.warehouses.map((w) => w.id);
  const st: Record<string, StockRow> = {};
  const per: Record<string, Record<string, StockRow>> = {};
  const bases: Record<string, Opname | undefined> = {};
  for (const wh of whs) {
    const r = stockCalcWh(m, wh, at);
    per[wh] = r.st;
    bases[wh] = r.base;
    for (const s in r.st) {
      const a = (st[s] ||= blank());
      const b = r.st[s];
      a.base += b.base;
      a.in += b.in;
      a.use += b.use;
      a.sold += b.sold;
      a.out += b.out;
      a.now += b.now;
    }
  }
  return { st, per, bases, base: whs.length === 1 ? bases[whs[0]] : null };
}

export const stockNow = (st: Record<string, StockRow>, sku: string) => (st[sku] ? st[sku].now : 0);

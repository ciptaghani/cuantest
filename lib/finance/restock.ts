import { addDays, daysBetween, type DateKey } from '@/lib/date';
import { leadTimeOrDefault, type OpsModel } from '@/lib/ops/model';
import { stockCalc, stockNow } from '@/lib/ops/stock';
import { variantKey, type OpsSkuRow } from '@/lib/ops/types';
import { invTotals } from './invoice';
import type { PurchaseDoc } from './types';

export type RestockPriority = 'kritis' | 'tinggi' | 'sedang' | 'rendah' | 'none';

export const RESTOCK_PRIORITY: Record<RestockPriority, { label: string; order: number }> = {
  kritis: { label: 'Kritis', order: 0 },
  tinggi: { label: 'Tinggi', order: 1 },
  sedang: { label: 'Sedang', order: 2 },
  rendah: { label: 'Rendah', order: 3 },
  none: { label: 'Tidak ada penjualan', order: 4 },
};

export interface RestockRow extends OpsSkuRow {
  stock: number;
  avg: number;
  lt: number;
  /** Lead time 99 (kebijakan brand) diasumsikan 7 hari. */
  ltPolicy: boolean;
  /** Stok cukup untuk (hari). */
  days: number;
  /** Restock paling lambat. */
  when: DateKey | '';
  /** Saran qty restock. */
  need: number;
  priority: RestockPriority;
  supplier: string;
  price: number;
  cost: number;
  /** Bagian kebutuhan yang berasal dari penjualan decant. */
  viaDecant: number;
}

export interface RestockResult {
  rows: RestockRow[];
  span: number;
}

/**
 * Schedule restock dari penjualan ≤ 3 bulan. Penjualan decant dikonversi ke botol fullsize sumbernya.
 * Saran qty = kebutuhan selama lead time + `coverDays` − stok sekarang (semua gudang).
 * Supplier & harga dari PO/faktur terakhir yang memuat SKU itu; kalau belum ada pakai HPP master.
 */
export function restockSchedule(m: OpsModel, purchases: PurchaseDoc[], coverDays = 30): RestockResult {
  const t = m.today;
  const from = addDays(t, -89);
  const y = m.yieldFrac;
  const { st } = stockCalc(m);
  const sd = Object.keys(m.sales)
    .filter((d) => d >= from && d <= t)
    .sort();
  const span = sd.length ? Math.min(90, daysBetween(sd[0], t) + 1) : 0;
  const dem: Record<string, number> = {};
  const direct: Record<string, number> = {};
  for (const d of sd) {
    const r = m.sales[d].rows;
    for (const s in r) {
      const q = +r[s] || 0;
      const sk = m.skuMap[s];
      if (!sk || !q) continue;
      if (sk.category === 'Decant') {
        const fs = m.mainSrc[variantKey(sk.brand, sk.product)];
        const f = fs ? m.skuMap[fs] : undefined;
        if (f && f.ml) dem[fs] = (dem[fs] || 0) + (q * sk.ml) / (f.ml * y);
      } else {
        dem[s] = (dem[s] || 0) + q;
        direct[s] = (direct[s] || 0) + q;
      }
    }
  }
  const sup: Record<string, { name: string; price: number; date: DateKey }> = {};
  [...purchases]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .forEach((v) => {
      const tt = invTotals(v);
      for (const l of tt.lines)
        if (l.kind === 'SKU' && l.sku) sup[l.sku] = { name: v.supplier, price: (+l.qty ? l.net / +l.qty : +l.price) || 0, date: v.date };
    });
  const cover = +coverDays || 30;
  const rows: RestockRow[] = Object.values(m.skuMap)
    .filter((s) => s.category !== 'Decant')
    .map((s) => {
      const stock = stockNow(st, s.code);
      const avg = span ? (dem[s.code] || 0) / span : 0;
      const lt0 = m.leadTimes[s.brand];
      const lt = leadTimeOrDefault(m, s.brand);
      const days = avg > 0 ? stock / avg : Infinity;
      const when = avg > 0 ? addDays(t, Math.max(0, Math.floor(days - lt))) : '';
      const need = avg > 0 ? Math.max(0, Math.ceil(avg * (lt + cover) - stock)) : 0;
      const priority: RestockPriority = avg <= 0 ? 'none' : stock <= 0 ? 'kritis' : days <= lt ? 'tinggi' : days <= lt + 7 ? 'sedang' : 'rendah';
      const sp = sup[s.code];
      return {
        ...s,
        stock,
        avg,
        lt,
        ltPolicy: lt0 != null && +lt0 === 99,
        days,
        when,
        need,
        priority,
        supplier: sp ? sp.name : '',
        price: sp ? sp.price : s.cogs,
        cost: need * (sp ? sp.price : s.cogs),
        viaDecant: (dem[s.code] || 0) - (direct[s.code] || 0),
      };
    });
  return { rows, span };
}

export function sortRestockRows(rows: RestockRow[]): RestockRow[] {
  return [...rows].sort((a, b) => RESTOCK_PRIORITY[a.priority].order - RESTOCK_PRIORITY[b.priority].order || a.days - b.days || b.need - a.need);
}

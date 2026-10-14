import { addDays, daysBetween } from '@/lib/date';
import { formatNumber as NF, n0 } from '@/lib/format';
import { leadTimeOrDefault, type OpsModel } from './model';
import { stockCalc, stockNow } from './stock';
import { variantKey, type OpsSkuRow } from './types';

export type AgeStatus = 'restock' | 'produksi' | 'sales' | 'safe';

export const AGE_STATUS_LABEL: Record<AgeStatus, string> = { restock: 'Restock', produksi: 'Produksi', sales: 'Sales', safe: 'Safe' };

/** Tidak terjual sekian hari → status Sales. */
export const NO_SALE_DAYS = 21;

export interface AgeRow extends OpsSkuRow {
  stock: number;
  avg: number;
  /** Umur stok (hari). */
  age: number;
  noSale: number;
  lastSale: string;
  status: AgeStatus;
  saran: string;
}

export interface AgeResult {
  rows: AgeRow[];
  /** Hari data penjualan yang dipakai (maks. 90). */
  span: number;
}

/**
 * Umur stok = stok semua gudang ÷ rata-rata terjual per hari (≤ 90 hari terakhir).
 * Untuk fullsize, pemakaian lewat decant ikut dihitung.
 */
export function umurStok(m: OpsModel): AgeResult {
  const t = m.today;
  const from = addDays(t, -89);
  const y = m.yieldFrac;
  const minDays = m.targetDays;
  const { st } = stockCalc(m);
  const sd = Object.keys(m.sales)
    .filter((d) => d >= from && d <= t)
    .sort();
  const span = sd.length ? Math.min(90, daysBetween(sd[0], t) + 1) : 0;
  const dem: Record<string, number> = {};
  const last: Record<string, string> = {};
  const seen = (s: string, d: string) => {
    if (!last[s] || d > last[s]) last[s] = d;
  };
  for (const d of sd) {
    const r = m.sales[d].rows;
    for (const s in r) {
      const q = +r[s] || 0;
      const sk = m.skuMap[s];
      if (!q) continue;
      dem[s] = (dem[s] || 0) + q;
      seen(s, d);
      if (sk && sk.category === 'Decant') {
        const fs = m.mainSrc[variantKey(sk.brand, sk.product)];
        const f = fs ? m.skuMap[fs] : undefined;
        if (f && f.ml) {
          dem['~' + fs] = (dem['~' + fs] || 0) + (q * sk.ml) / (f.ml * y);
          seen(fs, d);
        }
      }
    }
  }
  const rows: AgeRow[] = [];
  for (const s of Object.values(m.skuMap)) {
    const stock = stockNow(st, s.code);
    const avg = span ? ((dem[s.code] || 0) + (s.category === 'Decant' ? 0 : dem['~' + s.code] || 0)) / span : 0;
    const age = avg > 0 ? stock / avg : stock > 0 ? Infinity : 0;
    const noSale = last[s.code] ? daysBetween(last[s.code], t) : span;
    const lt = leadTimeOrDefault(m, s.brand);
    const fs = s.category === 'Decant' ? m.mainSrc[variantKey(s.brand, s.product)] : '';
    const fsStock = fs ? stockNow(st, fs) : 0;
    let status: AgeStatus | '';
    if (stock <= 0 && avg > 0) status = s.category === 'Decant' ? 'produksi' : 'restock';
    else if (stock > 0 && noSale >= NO_SALE_DAYS) status = 'sales';
    else if (s.category === 'Decant' && avg > 0 && age < minDays) status = 'produksi';
    else if (s.category !== 'Decant' && avg > 0 && age <= lt + 7) status = 'restock';
    else status = stock > 0 || avg > 0 ? 'safe' : '';
    if (!status) continue;
    let saran = '';
    if (status === 'restock') saran = `Restock ±${NF(Math.max(1, Math.ceil(avg * (lt + 30) - stock)))} pcs (lead time ${lt} hari + 30 hari).`;
    else if (status === 'produksi')
      saran = `Produksi ±${NF(Math.max(1, Math.ceil(avg * minDays - stock)))} pcs${fs ? ` dari ${fs} (stok ${n0(fsStock)})` : ' (belum ada sumber fullsize)'}.`;
    else if (status === 'sales') saran = `Tidak terjual ${noSale >= span && !last[s.code] ? '≥' + span : noSale} hari. Dorong lewat bundling, promo, live, atau iklan.`;
    else saran = Number.isFinite(age) ? `Stok aman ±${Math.floor(age)} hari.` : 'Ada stok, penjualan belum terekam.';
    rows.push({ ...s, stock, avg, age, noSale, lastSale: last[s.code] || '', status, saran });
  }
  return { rows, span };
}

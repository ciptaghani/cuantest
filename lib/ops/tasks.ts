import { addDays, daysBetween } from '@/lib/date';
import type { OpsModel } from './model';
import { stockCalc, stockNow } from './stock';
import { variantKey, type AvgMode, type OpsSkuRow } from './types';

export interface AvgDailyResult {
  avg: Record<string, number>;
  /** Jumlah hari data penjualan terbaru yang dipakai. */
  span: number;
  /** Data penjualan terbaru ≥ 7 hari. */
  ok: boolean;
  mode: AvgMode;
}

/** Rata-rata jual harian per SKU: dari histori, penjualan terbaru, atau yang lebih tinggi. */
export function avgDaily(m: OpsModel): AvgDailyResult {
  const mode = m.config.avgMode || 'HISTORY';
  const days = +m.config.avgDays || 30;
  const t = m.today;
  const cut = addDays(t, -days);
  const ds = Object.keys(m.sales)
    .filter((d) => d > cut && d <= t)
    .sort();
  const span = ds.length ? Math.min(days, daysBetween(ds[0], t) + 1) : 0;
  const log: Record<string, number> = {};
  for (const d of ds) {
    const r = m.sales[d].rows;
    for (const s in r) log[s] = (log[s] || 0) + (+r[s] || 0);
  }
  const ok = span >= 7;
  const avg: Record<string, number> = {};
  for (const s in m.skuMap) {
    const h = +m.history[s] || 0;
    const l = ok ? (log[s] || 0) / span : null;
    avg[s] = mode === 'LOG' ? (l ?? h) : mode === 'MAX' ? Math.max(h, l ?? 0) : h;
  }
  return { avg, span, ok, mode };
}

/** Pembulatan ke atas yang kebal galat floating point. */
export const ceilSafe = (x: number) => Math.ceil(x - 1e-9);

export type TaskPriority = 'high' | 'mid' | 'ok' | 'none';
export type FullsizeStatus = 'nosrc' | 'norule' | '-' | 'ok' | 'kurang';


export interface TaskRow extends OpsSkuRow {
  /** Rata-rata jual harian. */
  a: number;
  stock: number;
  /** Target stok = a × target hari. */
  min: number;
  /** Buffer lead time. */
  buf: number;
  /** Reorder point. */
  rop: number;
  lt: number | null | undefined;
  prio: TaskPriority;
  kurang: number;
  /** SKU fullsize sumber. */
  fs: string;
  /** Decant per botol. */
  r: number;
  /** Botol fullsize yang dibutuhkan. */
  need: number | null;
  fsStock: number | null;
  fsSt: FullsizeStatus;
}

/** Task produksi decant: prioritas berdasarkan stok vs target. */
export function taskRows(m: OpsModel): TaskRow[] {
  const { st } = stockCalc(m);
  const { avg } = avgDaily(m);
  const minDays = m.targetDays;
  const rows: TaskRow[] = [];
  for (const s of Object.values(m.skuMap)) {
    if (s.category !== 'Decant') continue;
    const a = avg[s.code] || 0;
    const stock = stockNow(st, s.code);
    const min = ceilSafe(a * minDays);
    const lt = m.leadTimes[s.brand];
    const ltOk = !(lt === undefined || lt === null || +lt === 99);
    const buf = ltOk ? ceilSafe(a * +lt!) : 0;
    const rop = min + buf;
    const prio: TaskPriority = min === 0 && stock === 0 ? 'none' : stock <= 0 || stock <= 0.5 * min ? 'high' : stock < min ? 'mid' : 'ok';
    const kurang = Math.max(0, min - stock);
    const fs = m.mainSrc[variantKey(s.brand, s.product)] || '';
    const fsS = fs ? m.skuMap[fs] : null;
    const r = fsS ? m.ratio(s.brand, fsS.ml, s.ml) : 0;
    const need = fs && r ? ceilSafe(kurang / r) : null;
    const fsStock = fs ? stockNow(st, fs) : null;
    const fsSt: FullsizeStatus = !fs ? 'nosrc' : !r ? 'norule' : kurang === 0 ? '-' : (fsStock as number) >= (need as number) ? 'ok' : 'kurang';
    rows.push({ ...s, a, stock, min, buf, rop, lt, prio, kurang, fs, r, need, fsStock, fsSt });
  }
  return rows;
}

import type { OpsModel } from './model';
import { variantKey, type OpsSkuRow } from './types';

/** Decant yang sumbernya `src` (atau varian yang sama). */
export function decantsOf(m: OpsModel, src: string): OpsSkuRow[] {
  const s = m.skuMap[src];
  if (!s) return [];
  return Object.values(m.skuMap)
    .filter((x) => x.category === 'Decant' && (m.mainSrc[variantKey(x.brand, x.product)] === src || (x.brand === s.brand && x.product === s.product)))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product) || a.ml - b.ml);
}

/** Tujuan geser decant: dari fullsize → semua decant-nya; dari decant → decant lain dengan sumber/varian sama. */
export function geserTargets(m: OpsModel, src: string): OpsSkuRow[] {
  const s = m.skuMap[src];
  if (!s) return [];
  if (s.category === 'Fullsize') return decantsOf(m, src);
  const key = variantKey(s.brand, s.product);
  const fs = m.mainSrc[key];
  return Object.values(m.skuMap)
    .filter((x) => x.category === 'Decant' && x.code !== src && (variantKey(x.brand, x.product) === key || (fs && m.mainSrc[variantKey(x.brand, x.product)] === fs)))
    .sort((a, b) => a.ml - b.ml);
}

/** Jumlah decant per satu botol sumber. Fullsize: dari aturan konversi. Decant: ml × susut ÷ ml tujuan. */
export function convRatio(m: OpsModel, src: OpsSkuRow | undefined, t: OpsSkuRow | undefined): number {
  if (!src || !t) return 0;
  if (src.category === 'Fullsize') return m.ratio(src.brand, src.ml, t.ml);
  const r = (src.ml * m.yieldFrac) / t.ml;
  return r >= 1 ? Math.floor(r) : Math.round(r * 100) / 100;
}

export interface YieldSummary {
  mlIn: number;
  mlOut: number;
  /** mlOut / mlIn. > 1,02 = mencurigakan, < 0,85 = boros. */
  yield: number;
}

/** Cek yield ml saat produksi. */

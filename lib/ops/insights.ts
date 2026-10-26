// Tampilan turunan halaman Operasional (pgTask, pgOpname, pgMaster di HTML), tetap fungsi murni.
import type { DateKey } from '@/lib/date';
import type { HppRow } from './hpp';
import type { OpsModel } from './model';
import { stockCalc } from './stock';
import { taskRows, type TaskRow } from './tasks';
import { POLICY_LEAD_TIME, variantKey, type OpsSkuRow } from './types';

/** "HMNS · Orevall 5ml" */
export const skuLabel = (s: Pick<OpsSkuRow, 'brand' | 'product' | 'ml'>) => `${s.brand} · ${s.product} ${s.ml ? s.ml + 'ml' : ''}`.trim();

export const brandsOf = (m: OpsModel) => [...new Set(Object.values(m.skuMap).map((s) => s.brand).filter(Boolean))].sort();

/** Urutan SKU di tabel: brand, produk, ukuran. */
export const bySkuOrder = (a: OpsSkuRow, b: OpsSkuRow) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product) || a.ml - b.ml;

export function leadTimeLabel(v: number | null | undefined): string {
  if (v === null || v === undefined) return '–';
  return +v === POLICY_LEAD_TIME ? 'Kebijakan brand' : `${v} hari`;
}

export interface FullsizeNeed {
  sku: string;
  s: OpsSkuRow;
  stock: number;
  /** Botol dibutuhkan untuk semua decant yang kurang. */
  need: number;
  /** Kurang botol (0 = cukup). */
  short: number;
  list: TaskRow[];
}

/** Kebutuhan botol fullsize dari task produksi decant (tampilan "Kebutuhan botol fullsize"). */
export function fullsizeNeeds(m: OpsModel, rows: TaskRow[]): FullsizeNeed[] {
  const agg: Record<string, Omit<FullsizeNeed, 'short'>> = {};
  for (const r of rows) {
    if (!r.fs || !r.kurang || !r.need) continue;
    const f = (agg[r.fs] ||= { sku: r.fs, s: m.skuMap[r.fs], stock: r.fsStock ?? 0, need: 0, list: [] });
    f.need += r.need;
    f.list.push(r);
  }
  return Object.values(agg)
    .map((f) => ({ ...f, short: Math.max(0, f.need - f.stock) }))
    .sort((a, b) => b.short - a.short || b.need - a.need);
}

export type QaItem = [kind: string, code: string, label: string];

/** Daftar "Cek data" di Master & aturan. */
export function qaList(m: OpsModel): QaItem[] {
  const q: QaItem[] = [];
  const rows = taskRows(m);
  for (const s of Object.values(m.skuMap)) if (!s.cogs) q.push(['HPP kosong', s.code, skuLabel(s)]);
  for (const r of rows) if (!r.fs) q.push(['Decant tanpa sumber fullsize', r.code, skuLabel(r)]);
  for (const r of rows) if (r.fs && !r.r) q.push(['Rasio konversi belum ada', r.code, `${r.brand} ${m.skuMap[r.fs].ml}ml → ${r.ml}ml`]);
  for (const c of m.rules) if (c.brand && !c.packId) q.push(['Aturan konversi tanpa botol/kemasan', c.brand, `${c.fromMl}ml → ${c.toMl}ml`]);
  for (const k in m.fsCount) if (m.fsCount[k] > 1) q.push(['Lebih dari 1 ukuran fullsize (pakai yang terbesar)', m.mainSrc[k], k.replace('||', ' · ')]);
  const { st } = stockCalc(m);
  for (const s of Object.keys(st)) if (!m.skuMap[s]) q.push(['Ada di log tapi tidak ada di master', s, '']);
  for (const s of Object.values(m.skuMap)) if (st[s.code] && st[s.code].now < 0) q.push(['Stok minus', s.code, skuLabel(s)]);
  return q;
}

export interface SourceRuleRow {
  key: string;
  brand: string;
  product: string;
  sizes: number[];
  /** Sumber dipakai sekarang (otomatis atau manual). */
  current: string;
  auto: string;
  manual: boolean;
  /** Ukuran decant yang belum punya rasio konversi dari sumber. */
  missing: number[];
}

/** Produk decant beserta sumber fullsize-nya (view "Aturan sumber fullsize"). */
export function sourceRuleRows(m: OpsModel): SourceRuleRow[] {
  const prods: Record<string, { brand: string; product: string; sizes: number[] }> = {};
  for (const s of Object.values(m.skuMap))
    if (s.category === 'Decant') (prods[variantKey(s.brand, s.product)] ||= { brand: s.brand, product: s.product, sizes: [] }).sizes.push(s.ml);
  return Object.entries(prods)
    .map(([key, p]) => {
      const current = m.mainSrc[key] || '';
      const f = m.skuMap[current];
      const ov = m.sourceOverrides[key];
      return {
        key,
        ...p,
        sizes: [...p.sizes].sort((a, b) => a - b),
        current,
        auto: m.autoSrc[key] || '',
        manual: !!(ov && m.skuMap[ov]),
        missing: f ? p.sizes.filter((ml) => !m.ratio(f.brand, f.ml, ml)) : [],
      };
    })
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product));
}

export interface OpnameRow extends OpsSkuRow {
  /** Stok sistem per tanggal opname. */
  sys: number;
  /** Hitung fisik; null = belum diisi. */
  v: number | null;
  diff: number | null;
}

/** Baris opname satu gudang: stok sistem per tanggal opname vs hitung fisik. */
export function opnameRows(m: OpsModel, op: { date: DateKey; warehouseId: string; counts: Record<string, number | null> }): OpnameRow[] {
  const { st } = stockCalc(m, op.date, [op.warehouseId]);
  return Object.values(m.skuMap).map((s) => {
    const sys = st[s.code] ? st[s.code].now : 0;
    const raw = op.counts[s.code];
    const v = raw === null || raw === undefined ? null : +raw;
    return { ...s, sys, v, diff: v === null ? null : v - sys };
  });
}

/** Saat opname diselesaikan: SKU yang belum diisi memakai stok sistem. */

/** "Terapkan HPP sekarang ke master": SKU yang HPP sekarang-nya berbeda ≥ Rp1 dari master. */

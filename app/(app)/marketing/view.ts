'use client';

import { one, type SP } from '@/components/qs';
import { todayKey, type DateKey } from '@/lib/date';
import { mkRanges } from '@/lib/marketing';
import { compute, dataRange, learnRates, type ComputeResult, type DateRange, type MarketplaceData, type StoreRate } from '@/lib/marketplace';
import type { OpsInput, OpsModel, StockRow } from '@/lib/ops';
import { buildOpsModel } from '@/lib/ops';
import { stockCalc } from '@/lib/ops/stock';
import { apiFetch } from '@/lib/api';

export const DAY_OPTS: [number, string][] = [
  [7, '7 hari terakhir'],
  [14, '14 hari'],
  [30, '30 hari'],
  [60, '60 hari'],
  [90, '90 hari'],
];

export function parseDays(sp: SP, def = 30): number {
  const d = +one(sp, 'days');
  return DAY_OPTS.some(([x]) => x === d) ? d : def;
}

export interface MkBase {
  data: MarketplaceData;
  rates: Record<string, StoreRate>;
  target: number;
  stores: { id: string; name: string }[];
  /** Tanggal data terakhir (atau hari ini kalau belum ada data). */
  end: DateKey;
}

export async function loadMkBase(): Promise<MkBase> {
  const [data, { targetMargin: target }] = await Promise.all([
    apiFetch<MarketplaceData>('/api/marketplace/data'),
    apiFetch<{ targetMargin: number }>('/api/marketplace/target-margin'),
  ]);
  const rates = learnRates(data);
  return { data, rates, target, stores: data.stores.map((s) => ({ id: s.id, name: s.name })), end: dataRange(data)[1] || todayKey() };
}

/** compute() Marketing: hanya filter toko (filter channel/brand Marketplace tidak dipakai). */
export function mkCompute(b: MkBase, range: DateRange, storeId: string): ComputeResult {
  return compute(b.data, range, b.rates, { storeId });
}

/** Periode sekarang & pembanding (N hari terakhir dari tanggal data terakhir). */
export function mkPair(b: MkBase, days: number, storeId: string) {
  const { cur, prev } = mkRanges(days, b.end);
  return { cur, prev, R: mkCompute(b, cur, storeId), P: mkCompute(b, prev, storeId) };
}

/** Stok sekarang semua gudang per SKU, null kalau master operasional belum ada. */
export async function mkStock(): Promise<Record<string, StockRow> | null> {
  const raw = await apiFetch<OpsInput>('/api/ops/model');
  const m = buildOpsModel({ ...raw, today: todayKey() });
  if (!Object.keys(m.skuMap).length) return null;
  return stockCalc(m).st;
}

export const storeId = (sp: SP, b: MkBase) => {
  const s = one(sp, 'store');
  return b.stores.some((x) => x.id === s) ? s : '';
};

export const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

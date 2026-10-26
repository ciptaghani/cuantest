'use client';

import type { SP } from '@/components/qs';
import { one } from '@/components/qs';
import { isValidDateKey, type DateKey } from '@/lib/date';
import { compute, currentRange, filterStores, learnRates, previousRange, type Channel, type ComputeResult, type MarketplaceData, type Period, type StoreRate } from '@/lib/marketplace';
import { apiFetch } from '@/lib/api';

/** Parameter filter Marketplace di URL (ikut dibawa saat pindah tab). */
export const MP_KEYS = ['p', 'from', 'to', 'ch', 'brand', 'store'];
export interface MpQuery {
  period: Period;
  from: DateKey;
  to: DateKey;
  channel: Channel | '';
  brand: string;
  storeId: string;
}

export function parseMpQuery(sp: SP | Record<string, string | undefined>): MpQuery {
  const get = (k: string) => one(sp as SP, k);
  const p = get('p');
  const period: Period = p === 'all' || p === 'custom' || p === '1' || p === '7' || p === '30' ? (p as Period) : '7';
  const ch = get('ch');
  const d = (k: string) => (isValidDateKey(get(k)) ? get(k) : '');
  return { period, from: d('from'), to: d('to'), channel: ch === 'shopee' || ch === 'tiktok' ? ch : '', brand: get('brand').slice(0, 60), storeId: get('store').slice(0, 40) };
}

export interface MpView {
  q: MpQuery;
  data: MarketplaceData;
  rates: Record<string, StoreRate>;
  target: number;
  brands: string[];
  /** Toko yang cocok dengan filter channel & brand (pilihan dropdown Toko). */
  storeOpts: { id: string; name: string }[];
  /** null = belum ada data pesanan/iklan. */
  R: ComputeResult | null;
  P: ComputeResult | null;
  storeCount: number;
}

/** Hitung Marketplace untuk filter di URL: periode sekarang + periode pembanding dengan panjang sama. */
export async function loadMpView(sp: SP | Record<string, string | undefined>): Promise<MpView> {
  const q = parseMpQuery(sp);
  const [data, { targetMargin: target }] = await Promise.all([
    apiFetch<MarketplaceData>('/api/marketplace/data'),
    apiFetch<{ targetMargin: number }>('/api/marketplace/target-margin'),
  ]);
  const rates = learnRates(data);
  const brands = [...new Set(Object.values(data.skus).map((s) => s.brand).filter((b): b is string => Boolean(b)))].sort();
  const brandStores = q.brand
    ? new Set(data.orders.filter((o) => data.skus[o.sku]?.brand === q.brand).map((o) => o.storeId))
    : null;
  const storeOpts = filterStores(data.stores, { channel: q.channel }).filter((s) => !brandStores || brandStores.has(s.id)).map((s) => ({ id: s.id, name: s.name }));
  if (q.storeId && !storeOpts.some((s) => s.id === q.storeId)) q.storeId = '';
  const filter = { channel: q.channel, brand: q.brand, storeId: q.storeId };
  const range = currentRange(data, q.period, { from: q.from || undefined, to: q.to || undefined });
  const storeCount = filterStores(data.stores, { channel: q.channel, storeId: q.storeId }).filter((s) => !brandStores || brandStores.has(s.id)).length;
  if (!range) return { q, data, rates, target, brands, storeOpts, R: null, P: null, storeCount };
  return { q, data, rates, target, brands, storeOpts, R: compute(data, range, rates, filter), P: compute(data, previousRange(range), rates, filter), storeCount };
}

/** "5 Jan 2026 – 11 Jan 2026" */
export function fmtRange(r: [DateKey, DateKey]): string {
  const f = (d: DateKey) => new Date(d + 'T00:00:00Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  return r[0] === r[1] ? f(r[0]) : `${f(r[0])} – ${f(r[1])}`;
}

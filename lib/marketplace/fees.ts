import { FEE_KEYS, orderKey, type FeeBreakdown, type MarketplaceData, type OrderFee } from './types';

/** Potongan aktual satu pesanan. Kalau semua komponen kosong tapi ada total penghasilan, selisihnya jadi "lain". */
export function feeOf(f: Partial<OrderFee>, subtotal: number): FeeBreakdown {
  const o = {} as FeeBreakdown;
  for (const c of FEE_KEYS) o[c] = Math.abs(+(f[c] ?? 0) || 0);
  const sum = FEE_KEYS.reduce((x, c) => x + o[c], 0);
  if (!sum && f.total) o.other = Math.max(0, subtotal - Math.abs(f.total));
  return o;
}

export interface StoreRate {
  source: 'efektif' | 'cadangan';
  /** Jumlah pesanan aktual yang dipakai. */
  n: number;
  /** Rupiah per pesanan. */
  process: number;
  /** Pecahan dari subtotal. */
  admin: number;
  freeShip: number;
  service: number;
  tax: number;
  other: number;
  ams: number;
}

const PCT_KEYS = ['admin', 'freeShip', 'service', 'tax', 'other', 'ams'] as const;
/** Minimal pesanan aktual sebelum tarif efektif dipakai. */
export const MIN_ACTUAL_ORDERS = 5;

/** Tarif efektif per toko dari pesanan yang sudah ada di laporan penghasilan, atau tarif cadangan. */
export function learnRates(data: Pick<MarketplaceData, 'stores' | 'orders' | 'fees'>): Record<string, StoreRate> {
  const osub: Record<string, number> = {};
  for (const o of data.orders) {
    const k = orderKey(o.storeId, o.orderNo);
    osub[k] = (osub[k] || 0) + o.subtotal;
  }
  const acc: Record<string, { sub: number; n: number } & FeeBreakdown> = {};
  for (const k in osub) {
    const f = data.fees[k];
    if (!f) continue;
    const st = k.split('|')[0];
    const a = (acc[st] ||= { sub: 0, n: 0, admin: 0, process: 0, freeShip: 0, service: 0, tax: 0, other: 0, ams: 0 });
    const ff = feeOf(f, osub[k]);
    a.sub += osub[k];
    a.n++;
    for (const c of FEE_KEYS) a[c] += ff[c];
  }
  const rates: Record<string, StoreRate> = {};
  for (const s of data.stores) {
    const a = acc[s.id];
    if (a && a.n >= MIN_ACTUAL_ORDERS) {
      const r: StoreRate = { source: 'efektif', n: a.n, process: a.process / a.n, admin: 0, freeShip: 0, service: 0, tax: 0, other: 0, ams: 0 };
      for (const c of PCT_KEYS) r[c] = a[c] / a.sub;
      rates[s.id] = r;
    } else {
      const f = s.fees;
      rates[s.id] = {
        source: 'cadangan',
        n: a ? a.n : 0,
        process: f.process,
        admin: f.admin / 100,
        freeShip: f.freeShip / 100,
        service: f.service / 100,
        tax: f.tax / 100,
        other: 0,
        ams: f.ams / 100,
      };
    }
  }
  return rates;
}

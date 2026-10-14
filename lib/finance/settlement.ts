import { daysBetween, type DateKey } from '@/lib/date';
import { enrich } from '@/lib/marketplace/compute';
import type { StoreRate } from '@/lib/marketplace/fees';
import { orderKey, type MarketplaceData, type Store } from '@/lib/marketplace/types';

export interface SettlementOrder {
  key: string;
  storeId: string;
  orderNo: string;
  date: DateKey;
  sub: number;
  /** Potongan (aktual atau estimasi). */
  fee: number;
  settled: boolean;
  /** Tanggal dana dilepas. */
  settledAt: DateKey | '';
  /** Nilai settlement: total penghasilan dari laporan, atau omzet − potongan. */
  net: number;
  age: number;
  /** Tanggal acuan periode (tanggal dana dilepas, atau tanggal pesanan). */
  periodDate: DateKey;
}

export interface SettlementResult {
  orders: SettlementOrder[];
  /** Sudah tersettle di periode. */
  settled: SettlementOrder[];
  unsettled: SettlementOrder[];
  /** Belum tersettle > 14 hari. */
  late: SettlementOrder[];
  /** Tersettle tapi tanpa tanggal dana dilepas. */
  noDate: number;
  perStore: { store: Store; settled: number; settledN: number; unsettled: number; unsettledN: number; oldest: number }[];
}

export const LATE_DAYS = 14;
const sum = (a: SettlementOrder[]) => a.reduce((s, o) => s + o.net, 0);
export const settlementSum = sum;

/** Pesanan sudah tersettle = ada di laporan penghasilan/settlement. */
export function settlement(mp: MarketplaceData, rates: Record<string, StoreRate>, from: DateKey, to: DateKey, today: DateKey): SettlementResult {
  const stores = mp.stores.filter((s) => !s.isDemo);
  const ids = new Set(stores.map((s) => s.id));
  const O: Record<string, SettlementOrder> = {};
  for (const l of enrich(
    mp.orders.filter((o) => ids.has(o.storeId)),
    mp,
    rates,
  )) {
    const k = orderKey(l.storeId, l.orderNo);
    const o = (O[k] ||= { key: k, storeId: l.storeId, orderNo: l.orderNo, date: l.ts.slice(0, 10), sub: 0, fee: 0, settled: false, settledAt: '', net: 0, age: 0, periodDate: '' });
    o.sub += l.subtotal;
    o.fee += l.mp + l.ams;
  }
  const all = Object.values(O);
  for (const o of all) {
    const f = mp.fees[o.key];
    o.settled = !!f;
    o.settledAt = (f && f.settledAt) || '';
    o.net = f && +f.total > 0 ? +f.total : o.sub - o.fee;
    o.age = daysBetween(o.date, today);
    o.periodDate = o.settledAt || o.date;
  }
  const settled = all.filter((o) => o.settled && o.periodDate >= from && o.periodDate <= to);
  const unsettled = all.filter((o) => !o.settled);
  const late = unsettled.filter((o) => o.age > LATE_DAYS);
  const perStore = stores.map((s) => {
    const a = settled.filter((o) => o.storeId === s.id);
    const b = unsettled.filter((o) => o.storeId === s.id);
    return { store: s, settled: sum(a), settledN: a.length, unsettled: sum(b), unsettledN: b.length, oldest: b.reduce((m, o) => Math.max(m, o.age), 0) };
  });
  return { orders: all, settled, unsettled, late, noDate: settled.filter((o) => !o.settledAt).length, perStore };
}

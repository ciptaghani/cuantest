import type { DateKey } from '@/lib/date';

export type Channel = 'shopee' | 'tiktok';

/** Komponen potongan marketplace per pesanan. */
export const FEE_KEYS = ['admin', 'process', 'freeShip', 'service', 'tax', 'other', 'ams'] as const;
export type FeeKey = (typeof FEE_KEYS)[number];
/** Potongan marketplace (tanpa affiliate/AMS). */
export const MP_KEYS: readonly FeeKey[] = ['admin', 'process', 'freeShip', 'service', 'tax', 'other'];
export type FeeBreakdown = Record<FeeKey, number>;

export const FEE_LABELS: Record<FeeKey, string> = {
  admin: 'Biaya administrasi',
  process: 'Biaya proses pesanan',
  freeShip: 'Gratis Ongkir XTRA',
  service: 'Layanan / Promo XTRA',
  tax: 'Pajak (PPh 22)',
  other: 'Potongan lain',
  ams: 'Komisi AMS / affiliate',
};

/** Tarif cadangan. Persen kecuali `process` (Rupiah per pesanan). */
export interface FallbackFees {
  admin: number;
  freeShip: number;
  service: number;
  tax: number;
  ams: number;
  process: number;
}

export const DEFAULT_FEES: Record<Channel, FallbackFees> = {
  shopee: { admin: 8, freeShip: 4.5, service: 4.5, tax: 0.5, ams: 0, process: 1250 },
  tiktok: { admin: 8, freeShip: 0, service: 4, tax: 0.5, ams: 0, process: 1250 },
};

export interface Store {
  id: string;
  name: string;
  channel: Channel;
  brand: string;
  isDemo: boolean;
  fees: FallbackFees;
}

/** Satu baris pesanan (satu SKU dalam satu pesanan). */
export interface OrderLine {
  storeId: string;
  orderNo: string;
  /** Waktu pesanan "YYYY-MM-DDTHH:mm". */
  ts: string;
  catalogKey: string;
  sku: string;
  name: string;
  qty: number;
  subtotal: number;
}

export interface OrderFee extends FeeBreakdown {
  /** Total penghasilan dari laporan (nilai settlement). */
  total: number;
  settledAt: DateKey | null;
}

export interface AdRecord {
  storeId: string;
  from: DateKey;
  to: DateKey;
  adName: string;
  /** Katalog yang dipilih langsung saat input manual. Kosong = pakai pencocokan. */
  catalogKey: string;
  amount: number;
  sales: number;
}

export interface AdMatch {
  catalogKey: string;
  manual: boolean;
}

export interface SkuInfo {
  name: string;
  cogs: number;
}

export interface MarketplaceData {
  stores: Store[];
  orders: OrderLine[];
  /** key = orderKey(storeId, orderNo) */
  fees: Record<string, OrderFee>;
  /** key = `${storeId}|${catalogKey}` → nama katalog */
  catalogs: Record<string, string>;
  skus: Record<string, SkuInfo>;
  ads: AdRecord[];
  /** key = `${storeId}|${norm(adName)}` */
  adMap: Record<string, AdMatch>;
}

export const orderKey = (storeId: string, orderNo: string) => `${storeId}|${orderNo}`;
export const catalogMapKey = (storeId: string, catalogKey: string) => `${storeId}|${catalogKey}`;

export type DateRange = [DateKey, DateKey];

export interface StoreFilter {
  channel?: Channel | '';
  brand?: string;
  storeId?: string;
}

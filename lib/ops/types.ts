import type { DateKey } from '@/lib/date';

export type SkuCategory = 'Fullsize' | 'Decant' | 'Lainnya';

export interface OpsSku {
  code: string;
  brand: string;
  /** Nama produk; brand + product = satu varian. */
  product: string;
  variant: string;
  ml: number;
  price: number;
  /** HPP master. */
  cogs: number;
}

export interface OpsSkuRow extends OpsSku {
  category: SkuCategory;
}

export interface ConversionRule {
  brand: string;
  fromMl: number;
  toMl: number;
  qtyPerBottle: number;
  packId: string | null;
}

export interface Pack {
  id: string;
  name: string;
  bottle: number;
  sticker: number;
  other: number;
}

export interface Warehouse {
  id: string;
  name: string;
}

export type MovementType = 'PRODUCTION' | 'SHIFT' | 'IN' | 'OUT' | 'TRANSFER';

export interface MovementLine {
  sku: string;
  qty: number;
  /** Harga beli per pcs (hanya IN). null = tanpa harga. */
  unitPrice: number | null;
}

export interface Movement {
  id: string;
  type: MovementType;
  date: DateKey;
  /** Urutan dalam satu tanggal (mis. epoch ms createdAt). */
  seq: number;
  warehouseId: string;
  toWarehouseId: string | null;
  /** Botol sumber (PRODUCTION/SHIFT). */
  sourceSku: string | null;
  sourceQty: number;
  reason: string;
  note: string;
  lines: MovementLine[];
}

export interface Opname {
  date: DateKey;
  warehouseId: string;
  final: boolean;
  /** null = belum dihitung. */
  counts: Record<string, number | null>;
}

export interface DailySales {
  date: DateKey;
  source: string;
  rows: Record<string, number>;
}

export type AvgMode = 'HISTORY' | 'LOG' | 'MAX';

export interface OpsConfig {
  /** Isi botol fullsize yang terpakai saat decant (%), default 95. */
  shrinkPct: number;
  /** Target stok decant (hari), default 14. */
  targetDays: number;
  avgMode: AvgMode;
  avgDays: number;
  mainWarehouseId: string;
  salesWarehouseId: string;
}

export interface OpsInput {
  warehouses: Warehouse[];
  skus: OpsSku[];
  rules: ConversionRule[];
  packs: Pack[];
  /** key `${brand}||${product}` → SKU fullsize sumber. */
  sourceOverrides: Record<string, string>;
  /** Lead time per brand (hari). 99 = kebijakan brand. null = belum diatur. */
  leadTimes: Record<string, number | null>;
  movements: Movement[];
  opnames: Opname[];
  /** key = tanggal */
  sales: Record<DateKey, DailySales>;
  /** Rata-rata jual harian dari histori Excel. */
  history: Record<string, number>;
  historyLabel: string;
  config: OpsConfig;
  today: DateKey;
}

export const variantKey = (brand: string, product: string) => `${brand}||${product}`;

export const DEFAULT_SHRINK_PCT = 95;
export const DEFAULT_TARGET_DAYS = 14;
export const POLICY_LEAD_TIME = 99;

import type { Area } from '@/lib/auth/permissions';
import { AD_FIELDS, FEE_FIELDS, HISTORY_FIELDS, OPNAME_FIELDS, ORDER_FIELDS, PRODUCT_INFO_FIELDS, SKU_FIELDS, type FieldDef } from '@/lib/parse';

export const IMPORT_KINDS = ['sku', 'orders', 'fees', 'ads', 'opname', 'productInfo', 'history'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export const IMPORT_SPEC: Record<ImportKind, { label: string; fields: FieldDef[]; areas: Area[] }> = {
  sku: { label: 'Master SKU & HPP', fields: SKU_FIELDS, areas: ['DATA'] },
  orders: { label: 'Export pesanan', fields: ORDER_FIELDS, areas: ['DATA'] },
  fees: { label: 'Laporan penghasilan / settlement', fields: FEE_FIELDS, areas: ['DATA'] },
  ads: { label: 'Laporan iklan', fields: AD_FIELDS, areas: ['DATA'] },
  opname: { label: 'Hasil stock opname', fields: OPNAME_FIELDS, areas: ['DATA', 'OPS'] },
  productInfo: { label: 'Info barang', fields: PRODUCT_INFO_FIELDS, areas: ['DATA', 'CS'] },
  history: { label: 'Histori rata-rata jual harian', fields: HISTORY_FIELDS, areas: ['DATA', 'OPS'] },
};

/** Semua area yang boleh upload file apa pun (untuk endpoint parse). */
export const ANY_IMPORT_AREAS: Area[] = ['DATA', 'OPS', 'CS'];

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ALLOWED_EXT = /\.(xlsx|xls|csv)$/i;

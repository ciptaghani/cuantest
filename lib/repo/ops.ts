import { todayKey, type DateKey } from '@/lib/date';
import { apiFetch } from '@/lib/api';
import { buildOpsModel, type MovementType, type OpsModel } from '@/lib/ops';

/** Model operasional siap hitung (stok, HPP, task) untuk hari ini (WIB). Dibangun lokal dari input mentah backend, karena OpsModel berisi fungsi (ruleFor, whName, …) yang tidak selamat lewat JSON. */

// ---------------------------------------------------------------------------
// Riwayat untuk halaman
// ---------------------------------------------------------------------------

export interface MovementLogRow {
  id: string;
  type: MovementType;
  date: DateKey;
  warehouseId: string;
  toWarehouseId: string | null;
  sourceSku: string | null;
  sourceQty: number;
  reason: string;
  note: string;
  lines: { sku: string; qty: number; unitPrice: number | null }[];
  /** Dibuat otomatis dari faktur pembelian (hanya bisa diubah di Finance). */
  fromInvoice: boolean;
  by: string;
}

/** Catatan produksi / keluar-masuk dalam periode, terbaru dulu. */

export interface RuleRow {
  id: string;
  brand: string;
  fromMl: number;
  toMl: number;
  qtyPerBottle: number;
  packId: string;
}

/** Aturan konversi beserta id-nya (untuk edit per baris di Master & aturan). */

export interface OpnameSession {
  id: string;
  date: DateKey;
  warehouseId: string;
  final: boolean;
  /** SKU yang sudah diisi qty-nya. */
  filled: number;
}


/** Hitungan fisik satu sesi opname (kode SKU → qty, null = belum dihitung). */
export async function opnameCounts(id: string): Promise<Record<string, number | null>> {
  return apiFetch<Record<string, number | null>>(`/api/ops/opnames/${id}/counts`);
}

export interface ReturnRow {
  id: string;
  date: DateKey;
  code: string;
  matches: boolean;
  processed: boolean;
  note: string;
  by: string;
}


export interface AttendanceMonth {
  employees: { id: string; name: string }[];
  /** employeeId → hari (1–31) → isian */
  days: Record<string, Record<number, { present: boolean; note: string }>>;
}

/** Absensi satu bulan (`YYYY-MM`). */

// Impor export pesanan, laporan penghasilan, dan laporan iklan.
// Logika disalin dari handler #ordFile, #feeFile, #adFile di reference/cuan-lens.html.
import type { DateKey } from '@/lib/date';
import type { OrderFee } from '@/lib/marketplace/types';
import { CANCEL_RE, norm, num } from '@/lib/parse';
import type { SheetRow } from '@/lib/parse/workbook';
import { cell, emptySummary, text, validTs, type ColumnMapping, type ImportSummary } from './common';

export interface PlannedOrderLine {
  row: number;
  orderNo: string;
  ts: string;
  catalogKey: string;
  sku: string;
  variation: string;
  qty: number;
  subtotal: number;
}

export interface OrdersPlan {
  lines: PlannedOrderLine[];
  /** catalogKey → nama katalog (nama produk di export). */
  catalogs: Record<string, string>;
  /** Tanggal yang terdampak (untuk bangkitkan ulang penjualan harian). */
  dates: DateKey[];
  summary: ImportSummary;
}

/**
 * Export pesanan → baris pesanan.
 * - Pesanan batal/retur (kolom status) dilewati.
 * - SKU kosong → nama produk + " - " + variasi.
 * - Katalog = SKU induk / ID produk, atau "N:" + nama produk.
 * - Subtotal = kolom subtotal, atau harga satuan × qty.
 */
export function planOrders(rows: SheetRow[], m: ColumnMapping): OrdersPlan {
  const summary = emptySummary();
  const lines: PlannedOrderLine[] = [];
  const catalogs: Record<string, string> = {};
  let cancelled = 0;
  for (const r of rows) {
    if (m.status && CANCEL_RE.test(String(cell(r, m, 'status') ?? ''))) {
      cancelled++;
      continue;
    }
    const ts = validTs(cell(r, m, 'date'));
    const orderNo = text(cell(r, m, 'orderId'));
    if (!orderNo) {
      summary.errors.push({ row: r.row, message: 'No. pesanan kosong' });
      continue;
    }
    if (!ts) {
      summary.errors.push({ row: r.row, message: `Tanggal pesanan tidak terbaca: "${text(cell(r, m, 'date'))}"` });
      continue;
    }
    const qty = num(cell(r, m, 'qty')) || 1;
    const name = text(cell(r, m, 'name'));
    const variation = m.variation ? text(cell(r, m, 'variation')) : '';
    let sku = m.sku ? text(cell(r, m, 'sku')) : '';
    if (!sku) sku = name + (variation ? ' - ' + variation : '');
    const catalogKey = (m.cat && text(cell(r, m, 'cat'))) || 'N:' + norm(name).slice(0, 120);
    catalogs[catalogKey] = name;
    const subtotal = m.subtotal ? num(cell(r, m, 'subtotal')) : num(cell(r, m, 'unit')) * qty;
    lines.push({ row: r.row, orderNo, ts, catalogKey, sku, variation, qty, subtotal });
  }
  summary.imported = lines.length;
  summary.skipped = cancelled;
  if (cancelled) summary.notes.push(`${cancelled} baris pesanan batal/retur dilewati.`);
  const orders = new Set(lines.map((l) => l.orderNo));
  if (lines.length) summary.notes.push(`${orders.size} pesanan dari ${Object.keys(catalogs).length} katalog.`);
  return { lines, catalogs, dates: [...new Set(lines.map((l) => l.ts.slice(0, 10)))].sort(), summary };
}

const FEE_COMPONENTS = ['admin', 'process', 'freeShip', 'service', 'tax', 'other', 'ams', 'total'] as const;

export interface FeesPlan {
  /** orderNo → potongan (baris dengan no. pesanan sama dijumlahkan, nilai absolut). */
  fees: Record<string, OrderFee>;
  summary: ImportSummary;
}

/**
 * Laporan penghasilan/settlement → potongan per pesanan.
 * "Biaya Isi Saldo Otomatis" sengaja tidak punya field, jadi tidak pernah dihitung.
 */
export function planFees(rows: SheetRow[], m: ColumnMapping): FeesPlan {
  const summary = emptySummary();
  const fees: Record<string, OrderFee> = {};
  let n = 0;
  for (const r of rows) {
    const orderNo = text(cell(r, m, 'orderId'));
    if (!orderNo) {
      summary.skipped++;
      continue;
    }
    const a = (fees[orderNo] ||= { admin: 0, process: 0, freeShip: 0, service: 0, tax: 0, other: 0, ams: 0, total: 0, settledAt: null });
    for (const c of FEE_COMPONENTS) if (m[c]) a[c] += Math.abs(num(cell(r, m, c)));
    if (m.settled) {
      const ts = validTs(cell(r, m, 'settled'));
      if (ts) a.settledAt = ts.slice(0, 10);
    }
    n++;
  }
  summary.imported = Object.keys(fees).length;
  summary.notes.push(`${n} baris dari ${summary.imported} pesanan.`);
  if (summary.skipped) summary.notes.push(`${summary.skipped} baris tanpa no. pesanan dilewati (biasanya baris total/penyesuaian).`);
  return { fees, summary };
}

export interface PlannedAd {
  row: number;
  from: DateKey;
  to: DateKey;
  adName: string;
  amount: number;
  sales: number;
}

export interface AdsPlan {
  ads: PlannedAd[];
  summary: ImportSummary;
}

/**
 * Laporan iklan → biaya iklan per nama iklan.
 * Periode dari kolom tanggal (per hari) atau dari periode yang diisi (dari–sampai).
 * Baris tanpa nama atau biaya 0 dilewati.
 */
export function planAds(rows: SheetRow[], m: ColumnMapping, period: { from?: DateKey; to?: DateKey }): AdsPlan {
  const summary = emptySummary();
  if (!m.date && (!period.from || !period.to)) {
    summary.errors.push({ row: 0, message: 'Isi periode laporan iklan (dari & sampai), atau pilih kolom tanggal.' });
    return { ads: [], summary };
  }
  const ads: PlannedAd[] = [];
  for (const r of rows) {
    const adName = text(cell(r, m, 'adName'));
    const amount = num(cell(r, m, 'amount'));
    if (!adName || !amount) {
      summary.skipped++;
      continue;
    }
    let from = period.from as DateKey;
    let to = period.to as DateKey;
    if (m.date) {
      const ts = validTs(cell(r, m, 'date'));
      if (!ts) {
        summary.errors.push({ row: r.row, message: `Tanggal tidak terbaca: "${text(cell(r, m, 'date'))}"` });
        continue;
      }
      from = to = ts.slice(0, 10);
    }
    ads.push({ row: r.row, from: from <= to ? from : to, to: from <= to ? to : from, adName, amount, sales: m.sales ? num(cell(r, m, 'sales')) : 0 });
  }
  summary.imported = ads.length;
  if (summary.skipped) summary.notes.push(`${summary.skipped} baris tanpa nama iklan atau biaya dilewati.`);
  return { ads, summary };
}

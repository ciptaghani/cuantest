// Impor master SKU & HPP, stock opname, dan info barang (CS).
// Logika disalin dari #skuFile, opnUpload, csUpload di reference/cuan-lens.html.
import { norm, num } from '@/lib/parse';
import type { SheetRow } from '@/lib/parse/workbook';
import { cell, emptySummary, isBlank, text, validTs, type ColumnMapping, type ImportSummary } from './common';

export interface PlannedSku {
  row: number;
  code: string;
  cogs: number;
  /** undefined = kolom tidak dipilih → nilai lama tidak diubah. */
  product?: string;
  brand?: string;
  ml?: number;
  price?: number;
  variant?: string;
}

/** Master SKU & HPP. SKU yang sudah ada diperbarui; kolom yang tidak dipilih tidak menimpa data lama. */
export function planSkus(rows: SheetRow[], m: ColumnMapping): { skus: PlannedSku[]; summary: ImportSummary } {
  const summary = emptySummary();
  const byCode = new Map<string, PlannedSku>();
  for (const r of rows) {
    const code = text(cell(r, m, 'sku'));
    if (!code) {
      summary.skipped++;
      continue;
    }
    if (code.length > 191) {
      summary.errors.push({ row: r.row, message: 'Kode SKU terlalu panjang (maks. 191 karakter)' });
      continue;
    }
    const s: PlannedSku = { row: r.row, code, cogs: num(cell(r, m, 'cogs')) };
    if (m.name) s.product = text(cell(r, m, 'name'));
    if (m.brand) s.brand = text(cell(r, m, 'brand'));
    if (m.ml) s.ml = num(cell(r, m, 'ml'));
    if (m.price) s.price = num(cell(r, m, 'price'));
    if (m.variant) s.variant = text(cell(r, m, 'variant'));
    if (byCode.has(code)) summary.notes.push(`SKU ${code} muncul lebih dari sekali; baris ${r.row} yang dipakai.`);
    byCode.set(code, s);
  }
  summary.imported = byCode.size;
  if (summary.skipped) summary.notes.push(`${summary.skipped} baris tanpa kode SKU dilewati.`);
  return { skus: [...byCode.values()], summary };
}

/** Hasil stock opname: hanya SKU di master; qty kosong dilewati. */
export function planOpname(rows: SheetRow[], m: ColumnMapping, knownSkus: Set<string>): { counts: Record<string, number>; summary: ImportSummary } {
  const summary = emptySummary();
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const sku = text(cell(r, m, 'sku'));
    const q = cell(r, m, 'qty');
    if (!sku || isBlank(q)) {
      summary.skipped++;
      continue;
    }
    if (!knownSkus.has(sku)) {
      summary.errors.push({ row: r.row, message: `Kode SKU tidak dikenal: ${sku}` });
      continue;
    }
    counts[sku] = Math.round(num(q));
  }
  summary.imported = Object.keys(counts).length;
  if (summary.skipped) summary.notes.push(`${summary.skipped} baris dengan qty kosong dilewati.`);
  return { counts, summary };
}

export interface PlannedInfo {
  row: number;
  brand: string;
  product: string;
  /** undefined = sel kosong → tidak menimpa data lama. */
  expiredAt?: string;
  notes?: string;
  lookUrl?: string;
}

/**
 * Info barang per varian (brand + nama produk). Sel kosong tidak menimpa data lama.
 * `variants`: kunci `norm(brand)|norm(product)` → nama asli di master.
 */
export function planProductInfo(
  rows: SheetRow[],
  m: ColumnMapping,
  variants: Map<string, { brand: string; product: string }>,
): { items: PlannedInfo[]; summary: ImportSummary } {
  const summary = emptySummary();
  const items: PlannedInfo[] = [];
  for (const r of rows) {
    const b = text(cell(r, m, 'brand'));
    const p = text(cell(r, m, 'product'));
    if (!b && !p) {
      summary.skipped++;
      continue;
    }
    const v = variants.get(norm(b) + '|' + norm(p));
    if (!v) {
      summary.errors.push({ row: r.row, message: `Varian tidak ada di master: ${b} · ${p}` });
      continue;
    }
    const exR = cell(r, m, 'expired');
    const ex = isBlank(exR) ? '' : (validTs(exR) || '').slice(0, 10);
    if (!isBlank(exR) && !ex) {
      summary.errors.push({ row: r.row, message: `Tanggal expired tidak terbaca: "${text(exR)}" (format YYYY-MM-DD)` });
      continue;
    }
    const notes = text(cell(r, m, 'notes'));
    const look = text(cell(r, m, 'look'));
    if (look && !/^https?:\/\//i.test(look)) summary.notes.push(`Baris ${r.row}: link look visual diabaikan karena tidak diawali http:// atau https://`);
    const it: PlannedInfo = { row: r.row, brand: v.brand, product: v.product };
    if (ex) it.expiredAt = ex;
    if (notes) it.notes = notes;
    if (look && /^https?:\/\//i.test(look)) it.lookUrl = look;
    if (it.expiredAt === undefined && it.notes === undefined && it.lookUrl === undefined) {
      summary.skipped++;
      continue;
    }
    items.push(it);
  }
  summary.imported = items.length;
  return { items, summary };
}

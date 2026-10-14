import { isValidTs } from '@/lib/date';
import { parseTs, type FieldDef } from '@/lib/parse';
import type { SheetRow } from '@/lib/parse/workbook';

/** field key → nama kolom di file ('' = tidak dipakai). */
export type ColumnMapping = Record<string, string>;

export interface RowIssue {
  row: number;
  message: string;
}

export interface ImportSummary {
  /** Baris/record yang berhasil diproses. */
  imported: number;
  /** Baris yang sengaja dilewati (mis. pesanan batal). */
  skipped: number;
  errors: RowIssue[];
  /** Catatan tambahan untuk ditampilkan ke user. */
  notes: string[];
}

export const emptySummary = (): ImportSummary => ({ imported: 0, skipped: 0, errors: [], notes: [] });

/** Ambil nilai sel untuk field tertentu. */
export const cell = (r: SheetRow, m: ColumnMapping, k: string): unknown => (m[k] ? r.cells[m[k]] : undefined);

export const text = (v: unknown): string => (v == null ? '' : String(v).trim());

/** `parseTs` + tolak tanggal mustahil (mis. 2027-31-31) yang tidak bisa disimpan ke database. */
export function validTs(v: unknown): string | null {
  const ts = parseTs(v);
  return ts && isValidTs(ts) ? ts : null;
}

export const isBlank =(v: unknown) => v === '' || v === null || v === undefined;

/** Pesan error kalau kolom wajib belum dipilih, atau null. */
export function missingRequired(fields: FieldDef[], m: ColumnMapping): string | null {
  const miss = fields.filter((f) => f.req && !m[f.k]).map((f) => f.l);
  return miss.length ? `Kolom wajib belum dipilih: ${miss.join(', ')}` : null;
}

/** Pastikan nama kolom di mapping memang ada di file. */
export function sanitizeMapping(m: ColumnMapping, headers: string[], fields: FieldDef[]): ColumnMapping {
  const ok = new Set(headers);
  const out: ColumnMapping = {};
  for (const f of fields) out[f.k] = m[f.k] && ok.has(m[f.k]) ? m[f.k] : '';
  return out;
}

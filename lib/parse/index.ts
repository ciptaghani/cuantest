import { dateKeyOf, pad } from '@/lib/date';

/** Angka dari sel Excel/teks: mendukung format Indonesia (1.234,5), Inggris (1,234.5), dan "Rp". */
export function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v == null) return 0;
  let s = String(v).replace(/rp|idr|\s/gi, '');
  if (!s) return 0;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

/** Waktu → "YYYY-MM-DDTHH:mm". Menerima Date, serial date Excel, "YYYY-MM-DD HH:mm", dan "DD/MM/YYYY HH:mm". */
export function parseTs(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${dateKeyOf(v)}T${pad(v.getHours())}:${pad(v.getMinutes())}`;
  }
  if (typeof v === 'number' && v > 20000) {
    const d = new Date(Math.round((v - 25569) * 864e5));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  }
  const s = String(v ?? '').trim();
  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}T${pad(m[4] || 0)}:${pad(m[5] || 0)}`;
  m = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}T${pad(m[4] || 0)}:${pad(m[5] || 0)}`;
  return null;
}

export const norm = (s: unknown) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export const toks = (s: unknown) =>
  norm(s)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1);

/** Status pesanan yang dilewati saat impor. */
export const CANCEL_RE = /batal|cancel|dibatalkan|gagal|return|pengembalian|refund/i;

export interface FieldDef {
  k: string;
  l: string;
  req?: boolean;
  /** Kandidat nama kolom (sudah dinormalisasi), urut prioritas. */
  c: string[];
}

/** Tebak kolom: pertama cari nama persis, lalu yang mengandung kandidat. Satu kolom hanya dipakai sekali. */
export function autoMap(headers: string[], fields: FieldDef[]): Record<string, string> {
  const H = headers.map(norm);
  const m: Record<string, string> = {};
  const used = new Set<number>();
  for (const f of fields) {
    let i = -1;
    for (const c of f.c) {
      const j = H.indexOf(c);
      if (j >= 0 && !used.has(j)) {
        i = j;
        break;
      }
    }
    m[f.k] = i >= 0 ? headers[i] : '';
    if (i >= 0) used.add(i);
  }
  for (const f of fields) {
    if (m[f.k]) continue;
    let i = -1;
    for (const c of f.c) {
      const j = H.findIndex((h, x) => !used.has(x) && h.includes(c));
      if (j >= 0) {
        i = j;
        break;
      }
    }
    m[f.k] = i >= 0 ? headers[i] : '';
    if (i >= 0) used.add(i);
  }
  return m;
}

export { SKU_FIELDS, ORDER_FIELDS, FEE_FIELDS, AD_FIELDS, OPNAME_FIELDS, PRODUCT_INFO_FIELDS, HISTORY_FIELDS } from './fields';

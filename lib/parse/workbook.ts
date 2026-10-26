import * as XLSX from 'xlsx';

/** Satu baris data dari sheet. `row` = nomor baris di Excel (1-based) untuk pesan error. */
export interface SheetRow {
  row: number;
  cells: Record<string, unknown>;
}

export interface ParsedSheet {
  sheet: string;
  headers: string[];
  rows: SheetRow[];
}

/**
 * Baca workbook (xlsx/xls/csv). Sama seperti HTML: di tiap sheet, baris header = baris pertama
 * (dalam 15 baris teratas) yang punya ≥ 3 sel teks; dipilih sheet dengan baris data terbanyak.
 * Sel tanggal dibaca sebagai serial Excel (bukan Date) supaya tidak bergantung zona waktu server;
 * `parseTs` mengubah serial ke "YYYY-MM-DDTHH:mm".
 */
export function readWorkbook(data: ArrayBuffer | Uint8Array): ParsedSheet {
  const wb = XLSX.read(data instanceof Uint8Array ? data : new Uint8Array(data), { type: 'array', cellDates: false, dense: true });
  let best: (ParsedSheet & { found: boolean }) | null = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true, blankrows: true });
    let h = 0;
    let found = false;
    for (let i = 0; i < Math.min(15, aoa.length); i++) {
      if ((aoa[i] || []).filter((v) => typeof v === 'string' && v.trim()).length >= 3) {
        h = i;
        found = true;
        break;
      }
    }
    const head = (aoa[h] || []).map((v) => String(v ?? '').trim());
    // Header kosong / dobel diberi nama unik seperti SheetJS (__EMPTY, Nama_1).
    const seen: Record<string, number> = {};
    const headers = head.map((x, i) => {
      const base = x || `__EMPTY${i ? '_' + i : ''}`;
      const n = seen[base] ?? 0;
      seen[base] = n + 1;
      return n ? `${base}_${n}` : base;
    });
    const rows: SheetRow[] = [];
    for (let i = h + 1; i < aoa.length; i++) {
      const r = aoa[i] || [];
      if (!r.some((v) => v !== '' && v != null)) continue;
      const cells: Record<string, unknown> = {};
      headers.forEach((k, j) => (cells[k] = r[j] ?? ''));
      rows.push({ row: i + 1, cells });
    }
    // Sheet dengan header terdeteksi diutamakan (supaya sheet "Petunjuk" tidak terpilih walau barisnya lebih banyak).
    if (!best || (found && !best.found) || (found === best.found && rows.length > best.rows.length))
      best = { sheet: name, headers: headers.filter((x) => !x.startsWith('__EMPTY')), rows, found };
  }
  if (!best) return { sheet: '', headers: [], rows: [] };
  const { found: _found, ...sheet } = best;
  return sheet;
}

export interface SheetSpec {
  name: string;
  rows: (string | number | null)[][];
  /** Lebar kolom (karakter). */
  cols?: number[];
}

/** Buat file .xlsx dari beberapa sheet (array of arrays). */
export function writeWorkbook(sheets: SheetSpec[]): Uint8Array<ArrayBuffer> {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    if (s.cols) ws['!cols'] = s.cols.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  return new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
}


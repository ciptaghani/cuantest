// Format angka & uang id-ID. Keluarannya sama persis dengan helper di HTML (rp, rpS, pc, xx, n0, n2).

const NF = new Intl.NumberFormat('id-ID');

export const formatNumber = (n: number) => NF.format(n);

/** Rp1.234.567 (dibulatkan ke rupiah). */
export function rp(n: number): string {
  return (n < 0 ? '-' : '') + 'Rp' + NF.format(Math.abs(Math.round(n || 0)));
}

/** Singkat: 1,2M / 3,4jt / 12rb. */
export function rpS(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? '-' : '';
  if (a >= 1e9) return s + (a / 1e9).toFixed(1).replace('.', ',') + 'M';
  if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace('.', ',') + 'jt';
  if (a >= 1e3) return s + Math.round(a / 1e3) + 'rb';
  return s + Math.round(a);
}

/** Persen dari pecahan: 0.123 → "12,3%". */
export function pc(n: number, digits = 1): string {
  return Number.isFinite(n) ? (n * 100).toFixed(digits).replace('.', ',') + '%' : '–';
}

/** Kelipatan ROAS: 4.5 → "4,5x". */
export function xx(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1).replace('.', ',') + 'x' : '–';
}

/** Qty dengan maks. 2 desimal. */
export function n0(v: number): string {
  return NF.format(Math.round((+v || 0) * 100) / 100);
}

/** Angka laporan keuangan tanpa "Rp". */
export function n2(v: number): string {
  return (v < 0 ? '-' : '') + NF.format(Math.round(Math.abs(v)));
}

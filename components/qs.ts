/** searchParams halaman App Router. */
export type SP = Record<string, string | string[] | undefined>;

/** Nilai pertama parameter, atau ''. */
export function one(sp: SP, k: string): string {
  const v = sp[k];
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export function all(sp: SP, k: string): string[] {
  const v = sp[k];
  return Array.isArray(v) ? v : v ? [v] : [];
}

/** "?a=1&b=2" dari parameter sekarang + perubahan (null/'' = hapus). */
export function qs(sp: SP, patch: Record<string, string | number | null | undefined> = {}): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k in patch) continue;
    for (const x of Array.isArray(v) ? v : v ? [v] : []) u.append(k, x);
  }
  for (const [k, v] of Object.entries(patch)) if (v !== null && v !== undefined && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '?';
}

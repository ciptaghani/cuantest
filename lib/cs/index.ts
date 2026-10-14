import { daysBetween, type DateKey } from '@/lib/date';
import { variantKey, type OpsSkuRow } from '@/lib/ops/types';
import { norm, toks } from '@/lib/parse';

/** Satu varian = brand + nama produk, berisi semua size-nya (csVariants di HTML). */
export interface CsVariant {
  key: string;
  brand: string;
  product: string;
  /** Urut ml naik. */
  skus: OpsSkuRow[];
}

export function csVariants(skuMap: Record<string, OpsSkuRow>): Record<string, CsVariant> {
  const V: Record<string, CsVariant> = {};
  for (const s of Object.values(skuMap)) {
    if (!s.brand && !s.product) continue;
    const key = variantKey(s.brand, s.product);
    (V[key] ||= { key, brand: s.brand, product: s.product, skus: [] }).skus.push(s);
  }
  for (const v of Object.values(V)) v.skus.sort((a, b) => a.ml - b.ml);
  return V;
}

/** Semua kata kunci harus ada di brand / produk / kode SKU (csSearch di HTML). Kata kunci kosong → tidak ada hasil. */
export function csSearch(V: Record<string, CsVariant>, q: string): CsVariant[] {
  const t = toks(q);
  if (!t.length) return [];
  return Object.values(V)
    .filter((v) => {
      const h = norm(v.brand + ' ' + v.product + ' ' + v.skus.map((s) => s.code).join(' '));
      return t.every((x) => h.includes(x));
    })
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product));
}

/** Expired ≤ 90 hari lagi diberi warna peringatan. */
export const EXP_WARN_DAYS = 90;

/** Status expired untuk chip: bad = sudah lewat, mid = ≤ 90 hari, ok = aman, none = belum diisi. */
export function expStatus(exp: DateKey | '' | null | undefined, today: DateKey): { cls: 'ok' | 'mid' | 'bad' | 'none'; days: number | null } {
  if (!exp) return { cls: 'none', days: null };
  const days = daysBetween(today, exp);
  return { cls: days < 0 ? 'bad' : days <= EXP_WARN_DAYS ? 'mid' : 'ok', days };
}

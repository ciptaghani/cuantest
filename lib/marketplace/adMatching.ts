import { norm, toks } from '@/lib/parse';
import type { AdMatch, AdRecord } from './types';

/**
 * Cocokkan nama iklan (sering terpotong) ke katalog toko.
 * `catalogs` = { `${storeId}|${catalogKey}`: nama }. Mengembalikan catalogKey atau ''.
 */
export function bestCatalog(catalogs: Record<string, string>, storeId: string, adName: string): string {
  const a = toks(adName);
  if (!a.length) return '';
  const prefix = storeId + '|';
  let best = '';
  let bs = 0;
  for (const k in catalogs) {
    if (!k.startsWith(prefix)) continue;
    const n = catalogs[k];
    if (norm(n) === norm(adName)) return k.slice(prefix.length);
    const b = new Set(toks(n));
    const bArr = [...b];
    let hit = 0;
    for (const t of a) if (b.has(t) || bArr.some((x) => x.startsWith(t) && t.length >= 3)) hit++;
    const sc = hit / a.length - Math.abs(b.size - a.length) / 200;
    if (sc > bs) {
      bs = sc;
      best = k.slice(prefix.length);
    }
  }
  return bs >= 0.6 ? best : '';
}

export const adMapKey = (storeId: string, adName: string) => `${storeId}|${norm(adName)}`;

/**
 * Isi pencocokan otomatis untuk iklan yang belum punya katalog.
 * Pilihan manual (termasuk "tidak cocok" yang dipilih manual) tidak ditimpa.
 * Mengembalikan peta baru; input tidak diubah.
 */
export function autoMatchAll(
  ads: AdRecord[],
  catalogs: Record<string, string>,
  adMap: Record<string, AdMatch>,
): Record<string, AdMatch> {
  const out = { ...adMap };
  for (const a of ads) {
    if (a.catalogKey) continue;
    const k = adMapKey(a.storeId, a.adName);
    const cur = out[k];
    if (!cur || (cur.catalogKey === '' && !cur.manual)) {
      out[k] = { catalogKey: bestCatalog(catalogs, a.storeId, a.adName), manual: false };
    }
  }
  return out;
}

/** Katalog untuk satu baris iklan (langsung atau lewat pencocokan). */
export function adCatalog(a: AdRecord, adMap: Record<string, AdMatch>): string {
  return a.catalogKey || adMap[adMapKey(a.storeId, a.adName)]?.catalogKey || '';
}

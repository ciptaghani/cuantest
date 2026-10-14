// Temuan otomatis, label, dan filter tabel halaman Marketplace (renderAlerts, chipsFor, renderTable di HTML).
import { pc, rp } from '@/lib/format';
import { norm } from '@/lib/parse';
import { adCatalog } from './adMatching';
import type { Aggregate, CatalogAgg, ComputeResult, SkuAgg } from './compute';
import type { MarketplaceData } from './types';

export type Sev = 'bad' | 'mid' | 'ok';

export interface MpAlert {
  sev: Sev;
  title: string;
  detail: string;
  /** Halaman tujuan tombol "Lihat". */
  target: 'katalog' | 'sku' | 'data' | '';
  flag: TableFlag | '';
}

/** Temuan "Perlu dicek" di Ringkasan. Iklan belum cocok dihitung dari semua iklan (tidak ikut filter periode). */
export function marketplaceAlerts(R: Pick<ComputeResult, 'lines' | 'catalogs' | 'total'>, data: Pick<MarketplaceData, 'skus' | 'ads' | 'adMap'>): MpAlert[] {
  const A: MpAlert[] = [];
  const noH = new Set(R.lines.filter((l) => !data.skus[l.sku]).map((l) => l.sku));
  if (noH.size) A.push({ sev: 'bad', title: `${noH.size} SKU belum ada HPP.`, detail: 'Labanya terhitung terlalu besar.', target: 'sku', flag: 'hpp' });
  const adNo = R.catalogs.filter((c) => c.ads > 0 && c.omzet === 0);
  if (adNo.length)
    A.push({ sev: 'bad', title: `${adNo.length} katalog keluar biaya iklan tapi tidak ada penjualan.`, detail: `Total ${rp(adNo.reduce((a, c) => a + c.ads, 0))}.`, target: 'katalog', flag: 'rugi' });
  const pre = R.catalogs.filter((c) => c.omzet > 0 && c.preAds < 0);
  if (pre.length)
    A.push({ sev: 'bad', title: `${pre.length} katalog sudah rugi sebelum iklan.`, detail: 'Naikkan harga atau ubah jadi bundling, iklan tidak akan menolong.', target: 'katalog', flag: 'rugi' });
  const eat = R.catalogs.filter((c) => c.preAds > 0 && c.net < 0);
  if (eat.length) A.push({ sev: 'mid', title: `${eat.length} katalog untung sebelum iklan tapi minus setelah iklan.`, detail: 'ROAS-nya di bawah ROAS impas.', target: 'katalog', flag: 'rugi' });
  const un = new Set(data.ads.filter((a) => !adCatalog(a, data.adMap)).map((a) => a.storeId + '|' + norm(a.adName)));
  if (un.size) A.push({ sev: 'mid', title: `${un.size} iklan belum cocok ke katalog.`, detail: 'Biayanya sementara dibagi rata ke katalog toko.', target: 'data', flag: '' });
  if (R.total.estPct > 0.15)
    A.push({ sev: 'mid', title: `${pc(R.total.estPct, 0)} baris pesanan pakai potongan estimasi.`, detail: 'Impor laporan penghasilan terbaru supaya pakai angka asli.', target: 'data', flag: '' });
  if (!A.length) A.push({ sev: 'ok', title: 'Semua aman.', detail: 'Tidak ada katalog minus dan semua HPP sudah terisi.', target: '', flag: '' });
  return A;
}

/** Kelas warna margin: neg = minus, wrn = di bawah target, pos = aman. `target` dalam persen. */
export function marginClass(m: number, target: number): 'neg' | 'wrn' | 'pos' | '' {
  if (!Number.isFinite(m)) return m === -Infinity ? 'neg' : '';
  return m < 0 ? 'neg' : m * 100 < target ? 'wrn' : 'pos';
}

export interface ChipView {
  cls: Sev | 'ch';
  label: string;
}

/** Label catatan per katalog/SKU di tabel. */
export function rowChips(p: Aggregate & { noHpp: boolean }): ChipView[] {
  const c: ChipView[] = [];
  if (p.noHpp) c.push({ cls: 'bad', label: 'HPP kosong' });
  if (p.omzet === 0 && p.ads > 0) c.push({ cls: 'bad', label: 'Iklan tanpa penjualan' });
  else if (p.preAds < 0) c.push({ cls: 'bad', label: 'Rugi sebelum iklan' });
  else if (p.net < 0) c.push({ cls: 'mid', label: 'Kalah di iklan' });
  if (p.estPct > 0) c.push({ cls: 'ch', label: `${pc(p.estPct, 0)} estimasi` });
  return c.length ? c : [{ cls: 'ok', label: 'Aman' }];
}

export type TableFlag = 'rugi' | 'target' | 'hpp' | 'iklan';

export interface TableFilter {
  q?: string;
  /** Margin minimum/maksimum (%), '' = tanpa batas. */
  min?: string;
  max?: string;
  flag?: TableFlag | '';
}

/** Filter tabel Katalog / Per SKU (sama dengan renderTable di HTML). */
export function filterProfitRows<T extends CatalogAgg | SkuAgg>(rows: T[], f: TableFilter, target: number): T[] {
  const q = norm(f.q || '');
  return rows.filter((p) => {
    const codes = 'skuCodes' in p ? p.skuCodes.join(' ') : '';
    const sku = 'sku' in p ? p.sku : '';
    if (q && !norm(p.name + ' ' + sku + ' ' + codes).includes(q)) return false;
    if (f.min && !(p.margin * 100 >= +f.min)) return false;
    if (f.max && !(p.margin * 100 <= +f.max)) return false;
    if (f.flag === 'rugi' && p.net >= 0) return false;
    if (f.flag === 'target' && !(p.margin * 100 < target)) return false;
    if (f.flag === 'hpp' && !p.noHpp) return false;
    if (f.flag === 'iklan' && !(p.ads > 0)) return false;
    return true;
  });
}

export interface ProfitTotals {
  n: number;
  qty: number;
  omzet: number;
  hpp: number;
  mp: number;
  ams: number;
  ads: number;
  net: number;
  margin: number;
}

/** Baris total tabel. */
export function profitTotals(rows: Aggregate[]): ProfitTotals {
  const s = { n: rows.length, qty: 0, omzet: 0, hpp: 0, mp: 0, ams: 0, ads: 0, net: 0, margin: NaN };
  for (const p of rows) {
    s.qty += p.qty;
    s.omzet += p.omzet;
    s.hpp += p.hpp;
    s.mp += p.mp;
    s.ams += p.ams;
    s.ads += p.ads;
    s.net += p.net;
  }
  s.margin = s.omzet ? s.net / s.omzet : NaN;
  return s;
}

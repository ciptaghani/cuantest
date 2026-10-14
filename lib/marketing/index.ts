import { addDays, daysBetween, daysInMonth, weekdayMon0, weekdaySun0, type DateKey } from '@/lib/date';
import { n0, pc, rp, xx } from '@/lib/format';
import type { Aggregate, CatalogAgg, ComputeResult, SkuAgg } from '@/lib/marketplace/compute';
import type { AdRecord, DateRange, Store } from '@/lib/marketplace/types';

export type Severity = 'bad' | 'mid' | 'ok';
export const SEVERITY_ORDER: Record<Severity, number> = { bad: 0, mid: 1, ok: 2 };

export type Advice = [Severity, string, string];

/** ROAS iklan kalau ada data penjualan iklan, selain itu ROAS toko. */
export const roasOf = (x: Pick<Aggregate, 'roasAd' | 'roas'>) => (Number.isFinite(x.roasAd) ? x.roasAd : x.roas);

/** Periode sekarang & pembanding (N hari terakhir dari tanggal data terakhir). */
export function mkRanges(days: number, dataEnd: DateKey): { cur: DateRange; prev: DateRange; end: DateKey } {
  const end = dataEnd;
  return { cur: [addDays(end, -(days - 1)), end], prev: [addDays(end, -(2 * days - 1)), addDays(end, -days)], end };
}

type AdviceItem = Aggregate & { noHpp?: boolean; skuCodes?: string[]; sku?: string };

/**
 * Saran otomatis per katalog/SKU dari penjualan, laba, iklan, dan stok.
 * `stock` = stok sekarang per SKU (null kalau data operasional belum ada). `targetMargin` dalam persen.
 */
export function mkAdvice(
  cur: AdviceItem,
  prev: Aggregate | undefined,
  kind: 'kat' | 'sku',
  days: number,
  stock: Record<string, { now: number }> | null,
  targetMargin: number,
): Advice[] {
  const A: Advice[] = [];
  const T = targetMargin;
  const g = prev && prev.omzet ? (cur.omzet - prev.omzet) / prev.omzet : null;
  const r = roasOf(cur);
  const be = cur.be;
  if (cur.noHpp) A.push(['bad', 'HPP kosong', 'Isi HPP supaya hitungan laba akurat.']);
  if (cur.omzet === 0 && cur.ads > 0) A.push(['bad', 'Iklan tanpa penjualan', `Matikan atau ganti materi iklan. Sudah keluar ${rp(cur.ads)} tanpa penjualan.`]);
  else if (cur.preAds < 0) A.push(['bad', 'Rugi sebelum iklan', 'Naikkan harga, buat bundling, atau berhenti jual. Iklan tidak akan menolong.']);
  else if (cur.net < 0 && cur.ads > 0 && Number.isFinite(be) && be > 20)
    A.push(['bad', 'Margin terlalu tipis untuk iklan', `ROAS impas ${xx(be)}, hampir mustahil dicapai. Matikan iklan dan perbaiki harga atau bundling dulu.`]);
  else if (cur.net < 0 && cur.ads > 0)
    A.push([
      'bad',
      'Kalah di iklan',
      `ROAS ${xx(r)} di bawah impas ${Number.isFinite(be) ? xx(be) : '–'}. Naikkan target ROAS ke ${Number.isFinite(be) ? xx(be * 1.15) : '–'} atau turunkan budget 20–30%.`,
    ]);
  else if (Number.isFinite(cur.margin) && cur.margin * 100 < T && cur.net >= 0 && cur.omzet > 0)
    A.push(['mid', 'Margin di bawah target', `Margin ${pc(cur.margin)} vs target ${T}%. Kurangi voucher/diskon atau naikkan target ROAS.`]);
  if (g !== null && g <= -0.3) A.push(['mid', 'Penjualan turun', `Omzet turun ${pc(-g, 0)} dari ${days} hari sebelumnya. Cek harga kompetitor, stok, rating, dan iklan.`]);
  if (stock) {
    const skus = kind === 'kat' ? cur.skuCodes || [] : [cur.sku as string];
    const perDay = cur.qty / days;
    const out = skus.filter((s) => stock[s] && stock[s].now <= 0);
    if (out.length && cur.qty > 0)
      A.push([
        'bad',
        'Stok habis',
        kind === 'kat' ? `${out.length} variasi habis: ${out.slice(0, 3).join(', ')}. Penjualan dan iklan jadi sia-sia.` : 'Segera produksi/restock. Penjualan berhenti selama stok kosong.',
      ]);
    else if (kind === 'sku' && cur.sku && stock[cur.sku] && perDay > 0 && stock[cur.sku].now / perDay < 7)
      A.push(['mid', 'Stok menipis', `Stok ${n0(stock[cur.sku].now)}, cukup ±${Math.floor(stock[cur.sku].now / perDay)} hari.`]);
  }
  if (cur.ads > 0 && Number.isFinite(r) && Number.isFinite(be) && r >= be * 1.5 && cur.net > 0)
    A.push(['ok', 'Siap di-scale', `ROAS ${xx(r)} jauh di atas impas ${xx(be)}. Naikkan budget 20–30% bertahap.`]);
  if (!cur.ads && cur.net > 0 && Number.isFinite(cur.margin) && cur.margin * 100 >= T + 5 && cur.qty >= 5)
    A.push(['ok', 'Potensi iklan', `Margin sehat dan laku organik. Coba iklan dengan target ROAS ≥ ${Number.isFinite(be) ? xx(be * 1.2) : '–'}.`]);
  if (g !== null && g >= 0.3 && cur.net > 0) A.push(['ok', 'Sedang naik', `Omzet naik ${pc(g, 0)}. Jaga stok dan pertimbangkan tambah budget.`]);
  return A;
}

export type AdsLevel = 'Pause' | 'Stop' | 'Kurangi' | 'Jaga' | 'Tambah sedikit' | 'Scale';

export interface AdsActionResult {
  a: string;
  cls: Severity;
  lvl: AdsLevel;
  r: number;
  be: number;
  daily: number;
  /** Tren ROAS vs periode sebelumnya. */
  tr: number | null;
}

/** Saran iklan per katalog: ROAS iklan dibanding ROAS impas. ROAS impas > 20x → stop iklan, perbaiki harga. */
export function adsAction(c: Aggregate, p: Aggregate | undefined, days: number): AdsActionResult {
  const r = roasOf(c);
  const be = c.be;
  const daily = c.ads / days;
  const pr = p ? roasOf(p) : NaN;
  const tr = Number.isFinite(pr) && Number.isFinite(r) ? (r - pr) / pr : null;
  let a: string;
  let cls: Severity;
  let lvl: AdsLevel;
  if (c.omzet === 0) {
    a = 'Pause iklan atau ganti kreatif/keyword. Belum ada penjualan.';
    cls = 'bad';
    lvl = 'Pause';
  } else if (c.preAds < 0) {
    a = 'Stop iklan dulu. Produk ini rugi sebelum iklan, perbaiki harga/bundling.';
    cls = 'bad';
    lvl = 'Stop';
  } else if (Number.isFinite(be) && be > 20 && r < be) {
    a = `Matikan iklan. ROAS impas ${xx(be)} terlalu tinggi karena margin tipis, perbaiki harga dulu.`;
    cls = 'bad';
    lvl = 'Stop';
  } else if (!Number.isFinite(be) || r < be) {
    a = `Turunkan budget 30% ke ±${rp(daily * 0.7)}/hari dan naikkan target ROAS ke ${Number.isFinite(be) ? xx(be * 1.15) : '–'}.`;
    cls = 'bad';
    lvl = 'Kurangi';
  } else if (r < be * 1.2) {
    a = `Pertahankan budget ±${rp(daily)}/hari, naikkan target ROAS tipis ke ${xx(be * 1.2)} supaya ada ruang laba.`;
    cls = 'mid';
    lvl = 'Jaga';
  } else if (r < be * 1.6) {
    a = `Pertahankan. Boleh naikkan budget 10–15% ke ±${rp(daily * 1.15)}/hari.`;
    cls = 'ok';
    lvl = 'Tambah sedikit';
  } else {
    a = `Naikkan budget 25–30% ke ±${rp(daily * 1.3)}/hari. Target ROAS boleh diturunkan 10% (±${xx(r * 0.9)}) untuk jangkauan, tetap di atas impas ${xx(be)}.`;
    cls = 'ok';
    lvl = 'Scale';
  }
  return { a, cls, lvl, r, be, daily, tr };
}

/** Biaya & penjualan iklan per minggu (Senin), 12 minggu terakhir. */
export function adsWeekly(ads: AdRecord[], stores: Store[], storeId = ''): [DateKey, { spend: number; sales: number }][] {
  const W: Record<DateKey, { spend: number; sales: number }> = {};
  const ids = new Set(stores.filter((s) => !storeId || s.id === storeId).map((s) => s.id));
  for (const a of ads) {
    if (!ids.has(a.storeId)) continue;
    const n = daysBetween(a.from, a.to) + 1;
    for (let i = 0; i < n; i++) {
      const d = addDays(a.from, i);
      const wk = addDays(d, -weekdayMon0(d));
      const w = (W[wk] ||= { spend: 0, sales: 0 });
      w.spend += a.amount / n;
      w.sales += (a.sales || 0) / n;
    }
  }
  return Object.entries(W)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-12);
}

export type BcgQuadrant = 'star' | 'cow' | 'q' | 'dog';

export const BCG_INFO: Record<BcgQuadrant, { label: string; cls: Severity | 'ch'; advice: string }> = {
  star: { label: 'Star', cls: 'ok', advice: 'Pertahankan dan scale: jaga stok aman, naikkan budget iklan bertahap, prioritaskan di campaign.' },
  cow: { label: 'Cash cow', cls: 'ch', advice: 'Jaga margin: kurangi ketergantungan iklan, naikkan target ROAS, jadikan anchor untuk bundling.' },
  q: { label: 'Question mark', cls: 'mid', advice: 'Uji dulu: iklan kecil dengan target ROAS ketat, perbaiki foto & judul, pantau 2 minggu.' },
  dog: { label: 'Dog', cls: 'bad', advice: 'Evaluasi: stop iklan, jadikan bundling atau clearance, hentikan kalau terus rugi.' },
};

export interface BcgItem<T> {
  x: T;
  /** Pertumbuhan omzet, dibatasi −100% s.d. +200%. */
  g: number;
  share: number;
  isNew: boolean;
  q: BcgQuadrant;
}

/** BCG matrix per toko: pangsa omzet (garis = rata-rata) vs pertumbuhan (garis = 10%). */
export function bcgItems<T extends CatalogAgg | SkuAgg>(cur: T[], prev: T[]): { items: BcgItem<T>[]; shareLine: number; growthLine: number } {
  const pm: Record<string, T> = {};
  for (const x of prev) pm[x.key] = x;
  const L = cur.filter((x) => x.omzet > 0);
  const tot = L.reduce((a, x) => a + x.omzet, 0);
  const items = L.map((x) => {
    const p = pm[x.key];
    const g = p && p.omzet ? (x.omzet - p.omzet) / p.omzet : 1;
    return { x, g: Math.max(-1, Math.min(2, g)), share: tot ? x.omzet / tot : 0, isNew: !(p && p.omzet), q: 'dog' as BcgQuadrant };
  });
  const sx = items.length ? 1 / items.length : 0;
  const gy = 0.1;
  for (const i of items) i.q = i.share >= sx ? (i.g >= gy ? 'star' : 'cow') : i.g >= gy ? 'q' : 'dog';
  return { items, shareLine: sx, growthLine: gy };
}

export interface PlanSuggestion {
  t: string;
  n: string;
}

/**
 * Saran kalender marketing: twin date, Harbolnas, payday, review mingguan (Senin) & bulanan.
 * `scaleNames` = katalog yang layak di-scale (dari `scaleCandidates`).
 */
export function planSuggest(month: string, scaleNames: string[] = []): Record<number, PlanSuggestion[]> {
  const [y, mo] = month.split('-').map(Number);
  const nd = daysInMonth(y, mo);
  const S2: Record<number, PlanSuggestion[]> = {};
  const add = (d: number, t: string, n: string) => {
    if (d < 1 || d > nd) return;
    (S2[d] ||= []).push({ t, n });
  };
  const sc = scaleNames.length ? ' Prioritaskan: ' + scaleNames.join('; ') + '.' : '';
  if (mo <= 12) {
    const tw = mo;
    add(tw - 2, `Persiapan twin date ${mo}.${mo}`, `Naikkan budget katalog terlaris 30–50%, turunkan target ROAS 10–20%, siapkan voucher & stok.${sc}`);
    add(tw, `Twin date ${mo}.${mo}`, `Budget naik 50% dari normal, pantau ROAS tiap 3 jam, matikan iklan yang ROAS-nya di bawah impas.${sc}`);
    add(tw + 1, `Setelah ${mo}.${mo}`, 'Kembalikan budget dan target ROAS ke normal. Catat hasilnya di Log perubahan.');
  }
  if (mo === 12) add(12, 'Harbolnas 12.12', 'Event terbesar: siapkan bundling dan flash sale sejak H-3.');
  add(25, 'Payday', 'Naikkan budget 15–20% sampai tanggal 1, fokus katalog Star.' + sc);
  for (let d = 1; d <= nd; d++) {
    const k = `${month}-${String(d).padStart(2, '0')}`;
    if (weekdaySun0(k) === 1) add(d, 'Review mingguan iklan', 'Buka Marketing → Ads → Saran weekly, terapkan dan catat di Log perubahan.');
  }
  add(1, 'Review bulanan', 'Cek BCG matrix & Saran monthly, susun rencana konten dan promo bulan ini.');
  return S2;
}

const short = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Maks. 3 katalog beriklan dengan saran Scale / Tambah sedikit (periode 30 hari). */
export function scaleCandidates(cur: ComputeResult, prev: ComputeResult, days = 30): string[] {
  const pm: Record<string, CatalogAgg> = {};
  for (const x of prev.catalogs) pm[x.key] = x;
  return cur.catalogs
    .filter((x) => x.ads > 0)
    .map((x) => ({ x, s: adsAction(x, pm[x.key], days) }))
    .filter((r) => r.s.lvl === 'Scale' || r.s.lvl === 'Tambah sedikit')
    .slice(0, 3)
    .map((r) => short(r.x.name, 40));
}

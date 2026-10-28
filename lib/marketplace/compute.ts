import { addDays, daysBetween, type DateKey } from '@/lib/date';
import { adCatalog } from './adMatching';
import { feeOf, type StoreRate } from './fees';
import {
  FEE_KEYS,
  MP_KEYS,
  catalogMapKey,
  orderKey,
  type Channel,
  type DateRange,
  type FeeBreakdown,
  type MarketplaceData,
  type OrderLine,
  type Store,
  type StoreFilter,
} from './types';

export type LineFlag = ['bad' | 'mid', string];

export interface EnrichedLine extends OrderLine, FeeBreakdown {
  cogs: number;
  hpp: number;
  unit: number;
  channel: Channel;
  storeName: string;
  catalogName: string;
  /** aktual = dari laporan penghasilan, estimasi = dari tarif. */
  src: 'aktual' | 'estimasi';
  /** Potongan marketplace (tanpa AMS). */
  mp: number;
  /** Laba sebelum iklan. */
  pre: number;
  flags: LineFlag[];
}

/** Tambahkan HPP & potongan ke tiap baris pesanan. */
export function enrich(
  lines: OrderLine[],
  data: Pick<MarketplaceData, 'stores' | 'skus' | 'fees' | 'catalogs'>,
  rates: Record<string, StoreRate>,
): EnrichedLine[] {
  const sm: Record<string, Store> = Object.fromEntries(data.stores.map((s) => [s.id, s]));
  const og: Record<string, { sub: number; n: number }> = {};
  for (const l of lines) {
    const g = (og[orderKey(l.storeId, l.orderNo)] ||= { sub: 0, n: 0 });
    g.sub += l.subtotal;
    g.n++;
  }
  return lines.map((l) => {
    const st = sm[l.storeId];
    const m = data.skus[l.sku];
    const k = orderKey(l.storeId, l.orderNo);
    const g = og[k];
    const cogs = m ? +m.cogs : 0;
    const hpp = cogs * l.qty;
    const share = g.sub > 0 ? l.subtotal / g.sub : 1 / g.n;
    const af = data.fees[k];
    const o = {
      ...l,
      cogs,
      hpp,
      unit: l.qty ? l.subtotal / l.qty : 0,
      channel: st.channel,
      storeName: st.name,
      catalogName: data.catalogs[catalogMapKey(l.storeId, l.catalogKey)] || l.name || l.catalogKey,
    } as EnrichedLine;
    if (af) {
      const f = feeOf(af, g.sub);
      for (const c of FEE_KEYS) o[c] = c === 'process' ? f[c] / g.n : f[c] * share;
      o.src = 'aktual';
    } else {
      const R = rates[l.storeId];
      for (const c of FEE_KEYS) o[c] = c === 'process' ? R.process / g.n : l.subtotal * R[c];
      o.src = 'estimasi';
    }
    o.mp = MP_KEYS.reduce((x, c) => x + o[c], 0);
    o.pre = l.subtotal - hpp - o.mp - o.ams;
    o.flags = [];
    if (!m) o.flags.push(['bad', 'HPP kosong']);
    else if (o.unit < cogs) o.flags.push(['bad', 'Jual < HPP']);
    if (m && o.pre < 0) o.flags.push(['bad', 'Rugi sebelum iklan']);
    if (o.src === 'estimasi') o.flags.push(['mid', 'Potongan estimasi']);
    return o;
  });
}

/** Agregat omzet → laba. Field turunan diisi oleh `finalize`. */
export interface Aggregate extends FeeBreakdown {
  omzet: number;
  hpp: number;
  ads: number;
  adSales: number;
  qty: number;
  lineN: number;
  estN: number;
  orderN: number;
  mp: number;
  /** mp + ams */
  cost: number;
  /** Laba kotor (omzet − HPP). */
  gp: number;
  /** Laba sebelum iklan. */
  preAds: number;
  /** Laba bersih. */
  net: number;
  margin: number;
  roas: number;
  roasAd: number;
  /** ROAS impas. */
  be: number;
  estPct: number;
}

interface AggInternal extends Aggregate {
  orders: Set<string>;
}

function agg<T extends object>(extra: T): AggInternal & T {
  const o = { omzet: 0, hpp: 0, ads: 0, adSales: 0, qty: 0, lineN: 0, estN: 0, orders: new Set<string>(), ...extra } as AggInternal & T;
  for (const c of FEE_KEYS) o[c] = 0;
  return o;
}

function addLine(o: AggInternal, l: EnrichedLine) {
  o.omzet += l.subtotal;
  o.hpp += l.hpp;
  for (const c of FEE_KEYS) o[c] += l[c];
  o.qty += l.qty;
  o.lineN++;
  if (l.src !== 'aktual') o.estN++;
  o.orders.add(l.orderNo);
}

function finalize<T extends AggInternal>(o: T): T {
  o.mp = MP_KEYS.reduce((x, c) => x + o[c], 0);
  o.cost = o.mp + o.ams;
  o.gp = o.omzet - o.hpp;
  o.preAds = o.gp - o.cost;
  o.net = o.preAds - o.ads;
  o.margin = o.omzet ? o.net / o.omzet : o.net < 0 ? -Infinity : NaN;
  o.roas = o.ads ? o.omzet / o.ads : NaN;
  o.roasAd = o.ads && o.adSales ? o.adSales / o.ads : NaN;
  o.be = o.preAds > 0 && o.omzet ? o.omzet / o.preAds : NaN;
  o.orderN = o.orders.size;
  o.estPct = o.lineN ? o.estN / o.lineN : 0;
  return o;
}

function strip<T extends AggInternal>(o: T): Omit<T, 'orders'> {
  const { orders: _orders, ...rest } = o;
  return rest;
}

export interface TotalAgg extends Aggregate {
  /** Iklan toko yang tidak bisa dibagi karena tidak ada omzet katalog. */
  unalloc: number;
}

export interface CatalogAgg extends Aggregate {
  key: string;
  catalogKey: string;
  name: string;
  storeId: string;
  storeName: string;
  channel: Channel;
  skuOmzet: Record<string, number>;
  skuCodes: string[];
  lines: EnrichedLine[];
  noHpp: boolean;
  poolAds: number;
  adNames: string[];
}

export interface SkuAgg extends Aggregate {
  key: string;
  sku: string;
  name: string;
  storeId: string;
  storeName: string;
  channel: Channel;
  catalogKeys: string[];
  lines: EnrichedLine[];
  noHpp: boolean;
}

export interface StoreAgg extends Aggregate {
  id: string;
  name: string;
  channel: Channel;
  brand: string;
}

export interface ComputeResult {
  total: TotalAgg;
  catalogs: CatalogAgg[];
  skus: SkuAgg[];
  stores: StoreAgg[];
  lines: EnrichedLine[];
  /** Biaya iklan per hari (dibagi rata dalam periode laporan). */
  adDaily: Record<DateKey, number>;
  range: DateRange;
}

export function filterStores(stores: Store[], f: StoreFilter = {}): Store[] {
  return stores.filter((s) => (!f.channel || s.channel === f.channel) && (!f.brand || s.brand === f.brand) && (!f.storeId || s.id === f.storeId));
}

/** Porsi hari laporan iklan yang masuk ke periode. */
export function overlap(a: { from: DateKey; to: DateKey }, range: DateRange): number {
  const f = a.from > range[0] ? a.from : range[0];
  const t = a.to < range[1] ? a.to : range[1];
  if (f > t) return 0;
  return (daysBetween(f, t) + 1) / (daysBetween(a.from, a.to) + 1);
}

/**
 * Hitung omzet, potongan, iklan, dan laba per katalog/SKU/toko untuk satu periode.
 * Iklan tanpa katalog dibagi ke katalog toko sesuai porsi omzet; iklan katalog dibagi ke SKU sesuai porsi omzet.
 */
export function compute(data: MarketplaceData, range: DateRange, rates: Record<string, StoreRate>, filter: StoreFilter = {}): ComputeResult {
  const brandStores = filter.brand
    ? new Set(data.orders.filter((o) => data.skus[o.sku]?.brand === filter.brand).map((o) => o.storeId))
    : null;
  const fs = filterStores(data.stores, { channel: filter.channel, storeId: filter.storeId }).filter(
    (s) => !filter.brand || s.brand === filter.brand || brandStores?.has(s.id),
  );
  const ids = new Set(fs.map((s) => s.id));
  const inR = (d: DateKey) => d >= range[0] && d <= range[1];
  const brandOf = (sku: string) => data.skus[sku]?.brand ?? '';
  const lines = enrich(
    data.orders.filter((o) => ids.has(o.storeId) && (!filter.brand || data.stores.find((s) => s.id === o.storeId)?.brand === filter.brand || brandOf(o.sku) === filter.brand) && inR(o.ts.slice(0, 10))),
    data,
    rates,
  );
  const SM: Record<string, Store> = Object.fromEntries(data.stores.map((s) => [s.id, s]));
  const T = agg({ unalloc: 0 });
  const cats: Record<string, AggInternal & Omit<CatalogAgg, keyof Aggregate>> = {};
  const skus: Record<string, AggInternal & Omit<SkuAgg, keyof Aggregate>> = {};
  const stores: Record<string, AggInternal & Omit<StoreAgg, keyof Aggregate>> = {};
  for (const s of fs) stores[s.id] = agg({ id: s.id, name: s.name, channel: s.channel, brand: s.brand });

  const skuSets: Record<string, Set<string>> = {};
  const catSets: Record<string, Set<string>> = {};
  const adNameSets: Record<string, Set<string>> = {};
  const catAgg = (st: string, c: string) => {
    const k = catalogMapKey(st, c);
    return (cats[k] ||= agg({
      key: k,
      catalogKey: c,
      name: data.catalogs[k] || c,
      storeId: st,
      storeName: SM[st].name,
      channel: SM[st].channel,
      skuOmzet: {} as Record<string, number>,
      skuCodes: [] as string[],
      lines: [] as EnrichedLine[],
      noHpp: false,
      poolAds: 0,
      adNames: [] as string[],
    }));
  };

  for (const l of lines) {
    addLine(T, l);
    addLine(stores[l.storeId], l);
    const c = catAgg(l.storeId, l.catalogKey);
    addLine(c, l);
    c.lines.push(l);
    (skuSets[c.key] ||= new Set()).add(l.sku);
    c.skuOmzet[l.sku] = (c.skuOmzet[l.sku] || 0) + l.subtotal;
    if (!data.skus[l.sku]) c.noHpp = true;
    const sk = `${l.storeId}|${l.sku}`;
    const s = (skus[sk] ||= agg({
      key: sk,
      sku: l.sku,
      name: data.skus[l.sku]?.name || l.sku,
      storeId: l.storeId,
      storeName: l.storeName,
      channel: l.channel,
      catalogKeys: [] as string[],
      lines: [] as EnrichedLine[],
      noHpp: !data.skus[l.sku],
    }));
    addLine(s, l);
    s.lines.push(l);
    (catSets[sk] ||= new Set()).add(l.catalogKey);
  }
  T.orders = new Set(lines.map((l) => orderKey(l.storeId, l.orderNo)));

  // iklan
  const pool: Record<string, number> = {};
  const adDaily: Record<DateKey, number> = {};
  for (const a of data.ads) {
    if (!ids.has(a.storeId)) continue;
    const f = overlap(a, range);
    if (!f) continue;
    const amt = a.amount * f;
    const sales = (a.sales || 0) * f;
    T.ads += amt;
    T.adSales += sales;
    stores[a.storeId].ads += amt;
    stores[a.storeId].adSales += sales;
    const d = daysBetween(a.from, a.to) + 1;
    for (let i = 0; i < d; i++) {
      const day = addDays(a.from, i);
      if (inR(day)) adDaily[day] = (adDaily[day] || 0) + a.amount / d;
    }
    const c = adCatalog(a, data.adMap);
    if (c) {
      const ca = catAgg(a.storeId, c);
      ca.ads += amt;
      ca.adSales += sales;
      (adNameSets[ca.key] ||= new Set()).add(a.adName);
    } else pool[a.storeId] = (pool[a.storeId] || 0) + amt;
  }
  for (const st in pool) {
    const cs = Object.values(cats).filter((c) => c.storeId === st && c.omzet > 0);
    const tot = cs.reduce((x, c) => x + c.omzet, 0);
    if (tot > 0)
      for (const c of cs) {
        c.ads += (pool[st] * c.omzet) / tot;
        c.poolAds += (pool[st] * c.omzet) / tot;
      }
    else T.unalloc += pool[st];
  }
  for (const c of Object.values(cats)) {
    if (!c.ads) continue;
    if (c.omzet > 0)
      for (const sku in c.skuOmzet) {
        const s = skus[`${c.storeId}|${sku}`];
        if (s) s.ads += (c.ads * c.skuOmzet[sku]) / c.omzet;
      }
  }
  for (const c of Object.values(cats)) {
    c.skuCodes = [...(skuSets[c.key] || [])];
    c.adNames = [...(adNameSets[c.key] || [])];
  }
  for (const s of Object.values(skus)) s.catalogKeys = [...(catSets[s.key] || [])];

  finalize(T);
  return {
    total: strip(T) as TotalAgg,
    catalogs: Object.values(cats).map((c) => strip(finalize(c)) as CatalogAgg),
    skus: Object.values(skus).map((s) => strip(finalize(s)) as SkuAgg),
    stores: Object.values(stores).map((s) => strip(finalize(s)) as StoreAgg),
    lines,
    adDaily,
    range,
  };
}

export interface VariationAgg extends Aggregate {
  sku: string;
  name: string;
}

/** Rincian per variasi (SKU) dalam satu katalog; iklan katalog dibagi sesuai porsi omzet (katDetail di HTML). */
export function catalogVariations(c: CatalogAgg, skus: MarketplaceData['skus']): VariationAgg[] {
  const rows: Record<string, AggInternal & { sku: string; name: string }> = {};
  for (const l of c.lines) addLine((rows[l.sku] ||= agg({ sku: l.sku, name: skus[l.sku]?.name || l.sku })), l);
  return Object.values(rows)
    .map((r) => {
      r.ads = c.omzet ? (c.ads * r.omzet) / c.omzet : 0;
      return strip(finalize(r)) as VariationAgg;
    })
    .sort((a, b) => b.omzet - a.omzet);
}

/** Omzet & laba sebelum iklan satu SKU per katalog tempat ia dijual (skuDetail di HTML). */
export function skuCatalogs(s: SkuAgg): { catalogKey: string; name: string; qty: number; omzet: number; pre: number }[] {
  const by: Record<string, { catalogKey: string; name: string; qty: number; omzet: number; pre: number }> = {};
  for (const l of s.lines) {
    const r = (by[l.catalogKey] ||= { catalogKey: l.catalogKey, name: l.catalogName, qty: 0, omzet: 0, pre: 0 });
    r.qty += l.qty;
    r.omzet += l.subtotal;
    r.pre += l.pre;
  }
  return Object.values(by);
}

/** Baris pesanan dengan laba sebelum iklan terendah. */
export const worstLines = (lines: EnrichedLine[], n: number): EnrichedLine[] => [...lines].sort((a, b) => a.pre - b.pre).slice(0, n);

export interface ChartSeries {
  hourly: boolean;
  /** Jam (0–23) atau tanggal. */
  keys: (number | DateKey)[];
  omzet: number[];
  net: number[];
  ads: number[];
}

/**
 * Omzet, laba bersih, dan iklan per hari (atau per jam kalau periode satu hari) untuk grafik Ringkasan.
 * Iklan per jam dibagi sesuai porsi omzet jam itu.
 */
export function chartSeries(R: Pick<ComputeResult, 'lines' | 'adDaily' | 'range'>): ChartSeries {
  const hourly = R.range[0] === R.range[1];
  const keys: (number | DateKey)[] = [];
  if (hourly) for (let h = 0; h < 24; h++) keys.push(h);
  else for (let d = R.range[0]; d <= R.range[1]; d = addDays(d, 1)) keys.push(d);
  const B = new Map<number | DateKey, { om: number; pre: number; ads: number }>(keys.map((k) => [k, { om: 0, pre: 0, ads: 0 }]));
  for (const l of R.lines) {
    const b = B.get(hourly ? +l.ts.slice(11, 13) : l.ts.slice(0, 10));
    if (b) {
      b.om += l.subtotal;
      b.pre += l.pre;
    }
  }
  if (hourly) {
    const ta = R.adDaily[R.range[0]] || 0;
    const to = keys.reduce<number>((a, k) => a + B.get(k)!.om, 0);
    for (const k of keys) B.get(k)!.ads = to ? (ta * B.get(k)!.om) / to : ta / 24;
  } else for (const k of keys) B.get(k)!.ads = R.adDaily[k as DateKey] || 0;
  const v = keys.map((k) => B.get(k)!);
  return { hourly, keys, omzet: v.map((b) => b.om), net: v.map((b) => b.pre - b.ads), ads: v.map((b) => b.ads) };
}

/** Rentang tanggal semua data pesanan & iklan. */
export function dataRange(data: Pick<MarketplaceData, 'orders' | 'ads'>): [DateKey | null, DateKey | null] {
  let mn: DateKey | null = null;
  let mx: DateKey | null = null;
  for (const o of data.orders) {
    const d = o.ts.slice(0, 10);
    if (!mn || d < mn) mn = d;
    if (!mx || d > mx) mx = d;
  }
  for (const a of data.ads) {
    if (!mn || a.from < mn) mn = a.from;
    if (!mx || a.to > mx) mx = a.to;
  }
  return [mn, mx];
}

export type Period = 'all' | 'custom' | `${number}`;

/** Periode aktif: N hari terakhir dari tanggal data terakhir, semua, atau custom. */
export function currentRange(
  data: Pick<MarketplaceData, 'orders' | 'ads'>,
  period: Period,
  custom: { from?: DateKey; to?: DateKey } = {},
): DateRange | null {
  const [mn, mx] = dataRange(data);
  if (!mx || !mn) return null;
  if (period === 'all') return [mn, mx];
  if (period === 'custom') {
    const f = custom.from || mn;
    const t = custom.to || mx;
    return f <= t ? [f, t] : [t, f];
  }
  return [addDays(mx, -(+period - 1)), mx];
}

/** Periode pembanding dengan panjang sama tepat sebelum `range`. */
export function previousRange(range: DateRange): DateRange {
  const len = daysBetween(range[0], range[1]) + 1;
  return [addDays(range[0], -len), addDays(range[0], -1)];
}

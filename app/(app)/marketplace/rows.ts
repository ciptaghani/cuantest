// Bentuk data ringkas untuk tabel Katalog / Per SKU dan rinciannya (dikirim ke client tanpa baris pesanan mentah).
import {
  catalogVariations,
  FEE_KEYS,
  marginClass,
  rowChips,
  skuCatalogs,
  worstLines,
  type CatalogAgg,
  type ChipView,
  type EnrichedLine,
  type FeeKey,
  type LineFlag,
  type MarketplaceData,
  type SkuAgg,
} from '@/lib/marketplace';

export interface ProfitRow {
  key: string;
  name: string;
  /** Baris kecil di bawah nama. */
  sub: string;
  storeName: string;
  channel: 'shopee' | 'tiktok';
  qty: number;
  omzet: number;
  hpp: number;
  mp: number;
  ams: number;
  ads: number;
  net: number;
  margin: number;
  roasAd: number;
  be: number;
  mcls: string;
  chips: ChipView[];
}

export function toProfitRow(p: CatalogAgg | SkuAgg, target: number): ProfitRow {
  const isSku = 'sku' in p;
  return {
    key: p.key,
    name: p.name,
    sub: isSku ? `${p.sku} · ada di ${p.catalogKeys.length} katalog` : `${p.skuCodes.length} variasi`,
    storeName: p.storeName,
    channel: p.channel,
    qty: p.qty,
    omzet: p.omzet,
    hpp: p.hpp,
    mp: p.mp,
    ams: p.ams,
    ads: p.ads,
    net: p.net,
    margin: p.margin,
    roasAd: p.roasAd,
    be: p.be,
    mcls: marginClass(p.margin, target),
    chips: rowChips(p),
  };
}

export interface LineView {
  orderNo: string;
  ts: string;
  sku: string;
  qty: number;
  unit: number;
  cogs: number | null;
  mp: number;
  ams: number;
  pre: number;
  flags: LineFlag[];
}

const lineView = (l: EnrichedLine, skus: MarketplaceData['skus']): LineView => ({
  orderNo: l.orderNo,
  ts: l.ts,
  sku: l.sku,
  qty: l.qty,
  unit: l.unit,
  cogs: skus[l.sku] ? l.cogs : null,
  mp: l.mp,
  ams: l.ams,
  pre: l.pre,
  flags: l.flags,
});

export type FeeView = Record<FeeKey, number> & { omzet: number };

const feeView = (p: CatalogAgg | SkuAgg): FeeView => Object.assign({ omzet: p.omzet }, ...FEE_KEYS.map((k) => ({ [k]: p[k] })));

export interface CatalogDetail {
  kind: 'kat';
  orderN: number;
  ads: number;
  poolAds: number;
  adSales: number;
  roasAd: number;
  roas: number;
  be: number;
  adNames: string[];
  variations: { sku: string; name: string; cogs: number | null; qty: number; omzet: number; hpp: number; mp: number; ams: number; ads: number; net: number; margin: number; mcls: string }[];
  fees: FeeView;
  worst: LineView[];
  missingHpp: string[];
}

export interface SkuDetail {
  kind: 'sku';
  orderN: number;
  ads: number;
  preAds: number;
  catalogs: { name: string; qty: number; omzet: number; pre: number }[];
  fees: FeeView;
  lines: LineView[];
  totalLines: number;
  missingHpp: string[];
}

export function catalogDetail(c: CatalogAgg, skus: MarketplaceData['skus'], target: number): CatalogDetail {
  return {
    kind: 'kat',
    orderN: c.orderN,
    ads: c.ads,
    poolAds: c.poolAds,
    adSales: c.adSales,
    roasAd: c.roasAd,
    roas: c.roas,
    be: c.be,
    adNames: c.adNames,
    variations: catalogVariations(c, skus).map((r) => ({
      sku: r.sku,
      name: r.name,
      cogs: skus[r.sku] ? skus[r.sku].cogs : null,
      qty: r.qty,
      omzet: r.omzet,
      hpp: r.hpp,
      mp: r.mp,
      ams: r.ams,
      ads: r.ads,
      net: r.net,
      margin: r.margin,
      mcls: marginClass(r.margin, target),
    })),
    fees: feeView(c),
    worst: worstLines(c.lines, 8).map((l) => lineView(l, skus)),
    missingHpp: c.skuCodes.filter((s) => !skus[s]),
  };
}

export function skuDetail(s: SkuAgg, skus: MarketplaceData['skus']): SkuDetail {
  return {
    kind: 'sku',
    orderN: s.orderN,
    ads: s.ads,
    preAds: s.preAds,
    catalogs: skuCatalogs(s).map(({ name, qty, omzet, pre }) => ({ name, qty, omzet, pre })),
    fees: feeView(s),
    lines: worstLines(s.lines, 40).map((l) => lineView(l, skus)),
    totalLines: s.lines.length,
    missingHpp: s.noHpp ? [s.sku] : [],
  };
}

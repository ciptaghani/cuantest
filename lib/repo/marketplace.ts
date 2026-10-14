import 'server-only';
import { prisma } from '@/lib/db';
import { learnRates, type MarketplaceData, type StoreRate } from '@/lib/marketplace';
import { cached, TAGS } from './cache';
import { dateKey, naiveTs, num } from './convert';

async function load(): Promise<MarketplaceData> {
  const [stores, catalogs, orders, fees, ads, maps, skus] = await Promise.all([
    prisma.store.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.catalog.findMany({ orderBy: { id: 'asc' } }),
    prisma.order.findMany({ include: { lines: { include: { catalog: { select: { externalKey: true } } }, orderBy: { id: 'asc' } } }, orderBy: { createdAt: 'asc' } }),
    prisma.orderFee.findMany(),
    prisma.adRecord.findMany({ include: { catalog: { select: { externalKey: true } } }, orderBy: [{ dateFrom: 'asc' }, { id: 'asc' }] }),
    prisma.adCatalogMap.findMany({ include: { catalog: { select: { externalKey: true } } } }),
    prisma.sku.findMany({ include: { brand: true } }),
  ]);
  const data: MarketplaceData = {
    stores: stores.map((s) => ({
      id: s.id,
      name: s.name,
      channel: s.channel === 'TIKTOK' ? 'tiktok' : 'shopee',
      brand: s.brand,
      isDemo: s.isDemo,
      fees: { admin: num(s.feeAdmin), freeShip: num(s.feeFreeShip), service: num(s.feeService), tax: num(s.feeTax), ams: num(s.feeAms), process: num(s.feeProcess) },
    })),
    orders: [],
    fees: {},
    catalogs: {},
    skus: {},
    ads: [],
    adMap: {},
  };
  for (const c of catalogs) data.catalogs[`${c.storeId}|${c.externalKey}`] = c.name;
  for (const o of orders) {
    const ts = naiveTs(o.createdAt);
    for (const l of o.lines)
      data.orders.push({ storeId: o.storeId, orderNo: o.orderNo, ts, catalogKey: l.catalog?.externalKey ?? '', sku: l.skuCode, name: '', qty: l.qty, subtotal: num(l.subtotal) });
  }
  for (const f of fees)
    data.fees[`${f.storeId}|${f.orderNo}`] = {
      admin: num(f.admin),
      process: num(f.process),
      freeShip: num(f.freeShip),
      service: num(f.service),
      tax: num(f.tax),
      other: num(f.other),
      ams: num(f.ams),
      total: num(f.total),
      settledAt: f.settledAt ? dateKey(f.settledAt) : null,
    };
  for (const a of ads)
    data.ads.push({ storeId: a.storeId, from: dateKey(a.dateFrom), to: dateKey(a.dateTo), adName: a.adName, catalogKey: a.catalog?.externalKey ?? '', amount: num(a.amount), sales: num(a.sales) });
  // AdCatalogMap.adName disimpan sudah dinormalisasi (norm()).
  for (const m of maps) data.adMap[`${m.storeId}|${m.adName}`] = { catalogKey: m.catalog?.externalKey ?? '', manual: m.manual };
  for (const s of skus) data.skus[s.code] = { name: [s.brand.name, s.productKey, num(s.ml) ? `${num(s.ml)}ml` : ''].filter(Boolean).join(' '), cogs: num(s.cogs) };
  return data;
}

/** Semua data Marketplace dari database (di-cache, invalidate dengan tag "marketplace"). */
export const getMarketplaceData = cached(load, 'marketplace-data', [TAGS.marketplace, TAGS.ops]);

export async function getMarketplace(): Promise<{ data: MarketplaceData; rates: Record<string, StoreRate> }> {
  const data = await getMarketplaceData();
  return { data, rates: learnRates(data) };
}

/** Target margin bersih (%) dari pengaturan, default 12. */
export async function getTargetMargin(): Promise<number> {
  const c = await prisma.appConfig.findUnique({ where: { id: 1 }, select: { targetMargin: true } });
  return c ? num(c.targetMargin) : 12;
}

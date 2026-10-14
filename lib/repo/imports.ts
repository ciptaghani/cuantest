import 'server-only';
import type { Prisma } from '@prisma/client';
import { addDays, type DateKey } from '@/lib/date';
import { prisma } from '@/lib/db';
import type { ImportSummary } from '@/lib/import/common';
import type { AdsPlan, FeesPlan, OrdersPlan } from '@/lib/import/marketplace';
import type { PlannedInfo, PlannedSku } from '@/lib/import/ops';
import { autoMatchAll } from '@/lib/marketplace/adMatching';
import type { AdMatch, AdRecord } from '@/lib/marketplace/types';
import { buildDailySales, ORDER_EXPORT_SOURCE } from '@/lib/ops/dailySales';
import { norm } from '@/lib/parse';
import { dateKey, naiveTs, toDbDate, toNaiveDate } from './convert';

type Tx = Prisma.TransactionClient;

/** Kesalahan yang pesannya aman ditampilkan ke user. */
export class ImportError extends Error {}

const TX_OPTS = { timeout: 180_000, maxWait: 15_000 };

function chunks<T>(a: T[], n = 1000): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

// ---------------------------------------------------------------------------
// Penjualan harian & pencocokan iklan (dipakai beberapa impor)
// ---------------------------------------------------------------------------

/**
 * Bangkitkan ulang DailySale "Export pesanan" untuk tanggal tertentu dari semua OrderLine toko non-demo.
 * Mengembalikan jumlah kode SKU pesanan yang belum ada di master (tidak mengurangi stok).
 */
export async function regenerateDailySales(tx: Tx, dates: DateKey[]): Promise<number> {
  if (!dates.length) return 0;
  const set = new Set(dates);
  const sorted = [...set].sort();
  const lines = await tx.orderLine.findMany({
    where: { order: { createdAt: { gte: toNaiveDate(sorted[0] + 'T00:00'), lt: toNaiveDate(addDays(sorted[sorted.length - 1], 1) + 'T00:00') }, store: { isDemo: false } } },
    select: { skuCode: true, qty: true, order: { select: { storeId: true, orderNo: true, createdAt: true } } },
  });
  const byDate = buildDailySales(
    lines.map((l) => ({ storeId: l.order.storeId, orderNo: l.order.orderNo, ts: naiveTs(l.order.createdAt), catalogKey: '', sku: l.skuCode, name: '', qty: l.qty, subtotal: 0 })),
    [],
    set,
  );
  const codes = [...new Set(Object.values(byDate).flatMap((r) => Object.keys(r)))];
  const skuIds = new Map<string, string>();
  for (const c of chunks(codes)) for (const s of await tx.sku.findMany({ where: { code: { in: c } }, select: { id: true, code: true } })) skuIds.set(s.code, s.id);
  await tx.dailySale.deleteMany({ where: { date: { in: sorted.map(toDbDate) }, source: ORDER_EXPORT_SOURCE } });
  const data: Prisma.DailySaleCreateManyInput[] = [];
  for (const [d, rows] of Object.entries(byDate))
    for (const [code, qty] of Object.entries(rows)) {
      const skuId = skuIds.get(code);
      if (skuId && qty) data.push({ date: toDbDate(d), skuId, qty, source: ORDER_EXPORT_SOURCE });
    }
  for (const c of chunks(data)) await tx.dailySale.createMany({ data: c });
  return codes.filter((c) => !skuIds.has(c)).length;
}

/** Cocokkan ulang nama iklan → katalog untuk satu toko. Pilihan manual tidak ditimpa. */
export async function rematchAds(tx: Tx, storeId: string): Promise<number> {
  const [ads, catalogs, maps] = await Promise.all([
    tx.adRecord.findMany({ where: { storeId }, select: { adName: true, catalogId: true, dateFrom: true, dateTo: true, amount: true, sales: true } }),
    tx.catalog.findMany({ where: { storeId }, orderBy: { id: 'asc' }, select: { id: true, externalKey: true, name: true } }),
    tx.adCatalogMap.findMany({ where: { storeId }, select: { adName: true, catalogId: true, manual: true } }),
  ]);
  const keyOf = new Map(catalogs.map((c) => [c.id, c.externalKey]));
  const idOf = new Map(catalogs.map((c) => [c.externalKey, c.id]));
  const cat: Record<string, string> = {};
  for (const c of catalogs) cat[`${storeId}|${c.externalKey}`] = c.name;
  const cur: Record<string, AdMatch> = {};
  for (const m of maps) cur[`${storeId}|${m.adName}`] = { catalogKey: m.catalogId ? (keyOf.get(m.catalogId) ?? '') : '', manual: m.manual };
  const domainAds: AdRecord[] = ads.map((a) => ({
    storeId,
    from: dateKey(a.dateFrom),
    to: dateKey(a.dateTo),
    adName: a.adName,
    catalogKey: a.catalogId ? (keyOf.get(a.catalogId) ?? '') : '',
    amount: Number(a.amount),
    sales: Number(a.sales),
  }));
  const next = autoMatchAll(domainAds, cat, cur);
  let unmatched = 0;
  for (const [k, v] of Object.entries(next)) {
    const adName = k.slice(storeId.length + 1);
    if (!v.catalogKey) unmatched++;
    const old = cur[k];
    if (old && old.catalogKey === v.catalogKey && old.manual === v.manual) continue;
    const catalogId = v.catalogKey ? (idOf.get(v.catalogKey) ?? null) : null;
    await tx.adCatalogMap.upsert({ where: { storeId_adName: { storeId, adName } }, create: { storeId, adName, catalogId, manual: v.manual }, update: { catalogId, manual: v.manual } });
  }
  return unmatched;
}

// ---------------------------------------------------------------------------
// Marketplace
// ---------------------------------------------------------------------------

async function requireStore(tx: Tx, storeId: string) {
  const s = await tx.store.findUnique({ where: { id: storeId } });
  if (!s) throw new ImportError('Toko tidak ditemukan. Pilih toko dulu.');
  return s;
}

/** Export pesanan → Order + OrderLine + Catalog (upsert per toko + no. pesanan; baris lama diganti). */
export async function importOrders(storeId: string, plan: OrdersPlan): Promise<ImportSummary> {
  const summary = plan.summary;
  if (!plan.lines.length) return summary;
  await prisma.$transaction(async (tx) => {
    const store = await requireStore(tx, storeId);
    // katalog
    const keys = Object.keys(plan.catalogs);
    const existing = new Map<string, { id: string; name: string }>();
    for (const c of chunks(keys))
      for (const x of await tx.catalog.findMany({ where: { storeId, externalKey: { in: c } }, select: { id: true, externalKey: true, name: true } })) existing.set(x.externalKey, x);
    const fresh = keys.filter((k) => !existing.has(k));
    for (const c of chunks(fresh)) await tx.catalog.createMany({ data: c.map((k) => ({ storeId, externalKey: k, name: plan.catalogs[k].slice(0, 500) })), skipDuplicates: true });
    for (const [k, x] of existing) if (plan.catalogs[k] && x.name !== plan.catalogs[k]) await tx.catalog.update({ where: { id: x.id }, data: { name: plan.catalogs[k].slice(0, 500) } });
    const catId = new Map<string, string>();
    for (const c of chunks(keys)) for (const x of await tx.catalog.findMany({ where: { storeId, externalKey: { in: c } }, select: { id: true, externalKey: true } })) catId.set(x.externalKey, x.id);

    // pesanan
    const firstTs = new Map<string, string>();
    for (const l of plan.lines) if (!firstTs.has(l.orderNo)) firstTs.set(l.orderNo, l.ts);
    const orderNos = [...firstTs.keys()];
    const oldOrders = new Map<string, { id: string; createdAt: Date }>();
    for (const c of chunks(orderNos))
      for (const o of await tx.order.findMany({ where: { storeId, orderNo: { in: c } }, select: { id: true, orderNo: true, createdAt: true } })) oldOrders.set(o.orderNo, o);
    // tanggal lama juga terdampak kalau tanggal pesanan berubah
    const dates = new Set(plan.dates);
    for (const o of oldOrders.values()) dates.add(naiveTs(o.createdAt).slice(0, 10));
    for (const c of chunks([...oldOrders.values()].map((o) => o.id))) await tx.orderLine.deleteMany({ where: { orderId: { in: c } } });
    for (const [no, o] of oldOrders) {
      const ts = firstTs.get(no) as string;
      if (naiveTs(o.createdAt) !== ts) await tx.order.update({ where: { id: o.id }, data: { createdAt: toNaiveDate(ts) } });
    }
    const newNos = orderNos.filter((n) => !oldOrders.has(n));
    for (const c of chunks(newNos)) await tx.order.createMany({ data: c.map((orderNo) => ({ storeId, orderNo, createdAt: toNaiveDate(firstTs.get(orderNo) as string) })) });
    const orderId = new Map<string, string>();
    for (const c of chunks(orderNos)) for (const o of await tx.order.findMany({ where: { storeId, orderNo: { in: c } }, select: { id: true, orderNo: true } })) orderId.set(o.orderNo, o.id);
    const lineData: Prisma.OrderLineCreateManyInput[] = plan.lines.map((l) => ({
      orderId: orderId.get(l.orderNo) as string,
      catalogId: catId.get(l.catalogKey) ?? null,
      skuCode: l.sku.slice(0, 191),
      variation: l.variation.slice(0, 191),
      qty: Math.round(l.qty),
      subtotal: l.subtotal,
    }));
    for (const c of chunks(lineData)) await tx.orderLine.createMany({ data: c });
    summary.notes.push(`${newNos.length} pesanan baru, ${oldOrders.size} pesanan diperbarui.`);

    if (!store.isDemo) {
      const unknown = await regenerateDailySales(tx, [...dates]);
      summary.notes.push(`Penjualan harian Operasional diperbarui untuk ${dates.size} tanggal.`);
      if (unknown) summary.notes.push(`${unknown} kode SKU di pesanan belum ada di master SKU, jadi belum mengurangi stok.`);
    }
    const un = await rematchAds(tx, storeId);
    if (un) summary.notes.push(`${un} nama iklan belum cocok ke katalog. Cek di Pencocokan iklan.`);
  }, TX_OPTS);
  return summary;
}

/** Laporan penghasilan → OrderFee (per toko + no. pesanan, diganti utuh). */
export async function importFees(storeId: string, plan: FeesPlan): Promise<ImportSummary> {
  const summary = plan.summary;
  const nos = Object.keys(plan.fees);
  if (!nos.length) return summary;
  await prisma.$transaction(async (tx) => {
    await requireStore(tx, storeId);
    for (const c of chunks(nos)) {
      await tx.orderFee.deleteMany({ where: { storeId, orderNo: { in: c } } });
      await tx.orderFee.createMany({
        data: c.map((orderNo) => {
          const f = plan.fees[orderNo];
          return {
            storeId,
            orderNo: orderNo.slice(0, 191),
            admin: f.admin,
            process: f.process,
            freeShip: f.freeShip,
            service: f.service,
            tax: f.tax,
            other: f.other,
            ams: f.ams,
            total: f.total,
            settledAt: f.settledAt ? toDbDate(f.settledAt) : null,
          };
        }),
      });
    }
    let matched = 0;
    for (const c of chunks(nos)) matched += await tx.order.count({ where: { storeId, orderNo: { in: c } } });
    if (matched < nos.length) summary.notes.push(`${nos.length - matched} pesanan belum ada di export pesanan. Potongannya tersimpan dan otomatis terpakai setelah export pesanan diupload.`);
  }, TX_OPTS);
  return summary;
}

/** Laporan iklan → AdRecord (baris dengan toko + periode + nama sama diganti) + pencocokan otomatis. */
export async function importAds(storeId: string, plan: AdsPlan): Promise<ImportSummary> {
  const summary = plan.summary;
  if (!plan.ads.length) return summary;
  await prisma.$transaction(async (tx) => {
    await requireStore(tx, storeId);
    const sig = (from: string, to: string, name: string) => `${from}|${to}|${norm(name)}`;
    const want = new Set(plan.ads.map((a) => sig(a.from, a.to, a.adName)));
    const froms = [...new Set(plan.ads.map((a) => a.from))];
    const old: string[] = [];
    for (const c of chunks(froms))
      for (const a of await tx.adRecord.findMany({ where: { storeId, dateFrom: { in: c.map(toDbDate) } }, select: { id: true, dateFrom: true, dateTo: true, adName: true } }))
        if (want.has(sig(dateKey(a.dateFrom), dateKey(a.dateTo), a.adName))) old.push(a.id);
    for (const c of chunks(old)) await tx.adRecord.deleteMany({ where: { id: { in: c } } });
    // baris dobel di file yang sama: yang terakhir dipakai (sama seperti HTML)
    const last = new Map<string, (typeof plan.ads)[number]>();
    for (const a of plan.ads) last.set(sig(a.from, a.to, a.adName), a);
    const data = [...last.values()].map((a) => ({ storeId, dateFrom: toDbDate(a.from), dateTo: toDbDate(a.to), adName: a.adName.slice(0, 500), amount: a.amount, sales: a.sales }));
    for (const c of chunks(data)) await tx.adRecord.createMany({ data: c });
    if (old.length) summary.notes.push(`${old.length} baris iklan lama dengan periode & nama yang sama diganti.`);
    const un = await rematchAds(tx, storeId);
    if (un) summary.notes.push(`${un} nama iklan belum cocok ke katalog. Biayanya dibagi ke semua katalog toko sampai dicocokkan manual.`);
  }, TX_OPTS);
  return summary;
}

// ---------------------------------------------------------------------------
// Operasional & CS
// ---------------------------------------------------------------------------

/** Master SKU & HPP. Brand baru dibuat otomatis; kolom yang tidak dipilih tidak menimpa data lama. */
export async function importSkus(skus: PlannedSku[], summary: ImportSummary): Promise<ImportSummary> {
  if (!skus.length) return summary;
  await prisma.$transaction(async (tx) => {
    const brandNames = [...new Set(skus.map((s) => s.brand ?? '').map((b) => b.slice(0, 191)))];
    for (const c of chunks(brandNames)) await tx.brand.createMany({ data: c.map((name) => ({ name })), skipDuplicates: true });
    const brandId = new Map<string, string>();
    for (const c of chunks(brandNames)) for (const b of await tx.brand.findMany({ where: { name: { in: c } } })) brandId.set(b.name, b.id);
    const existing = new Map<string, string>();
    for (const c of chunks(skus.map((s) => s.code))) for (const s of await tx.sku.findMany({ where: { code: { in: c } }, select: { id: true, code: true } })) existing.set(s.code, s.id);
    let created = 0;
    let updated = 0;
    const fresh = skus.filter((s) => !existing.has(s.code));
    for (const c of chunks(fresh))
      created += (
        await tx.sku.createMany({
          data: c.map((s) => ({
            code: s.code,
            brandId: brandId.get((s.brand ?? '').slice(0, 191)) as string,
            productKey: (s.product ?? '').slice(0, 191),
            variant: (s.variant ?? '').slice(0, 191),
            ml: s.ml ?? 0,
            price: s.price ?? 0,
            cogs: s.cogs,
          })),
        })
      ).count;
    for (const s of skus) {
      const id = existing.get(s.code);
      if (!id) continue;
      const data: Prisma.SkuUncheckedUpdateInput = { cogs: s.cogs, active: true };
      if (s.brand !== undefined) data.brandId = brandId.get(s.brand.slice(0, 191));
      if (s.product !== undefined) data.productKey = s.product.slice(0, 191);
      if (s.variant !== undefined) data.variant = s.variant.slice(0, 191);
      if (s.ml !== undefined) data.ml = s.ml;
      if (s.price !== undefined) data.price = s.price;
      await tx.sku.update({ where: { id }, data });
      updated++;
    }
    summary.notes.push(`${created} SKU baru, ${updated} SKU diperbarui.`);
    // SKU baru bisa membuat penjualan lama yang tadinya "tidak dikenal" ikut mengurangi stok.
    if (created) {
      const dates = await tx.order.findMany({ where: { store: { isDemo: false }, lines: { some: { skuCode: { in: fresh.map((s) => s.code) } } } }, select: { createdAt: true } });
      const ds = [...new Set(dates.map((d) => naiveTs(d.createdAt).slice(0, 10)))];
      if (ds.length) {
        await regenerateDailySales(tx, ds);
        summary.notes.push(`Penjualan harian ${ds.length} tanggal dihitung ulang untuk SKU baru.`);
      }
    }
  }, TX_OPTS);
  return summary;
}

/** Hasil stock opname ke opname draft gudang + tanggal (dibuat kalau belum ada). Opname final tidak bisa diubah. */
export async function importOpname(warehouseId: string, date: DateKey, counts: Record<string, number>, userId: string, summary: ImportSummary): Promise<ImportSummary> {
  const codes = Object.keys(counts);
  if (!codes.length) return summary;
  await prisma.$transaction(async (tx) => {
    const wh = await tx.warehouse.findUnique({ where: { id: warehouseId } });
    if (!wh) throw new ImportError('Gudang tidak ditemukan.');
    let op = await tx.opname.findUnique({ where: { warehouseId_date: { warehouseId, date: toDbDate(date) } } });
    if (op?.final) throw new ImportError(`Opname ${wh.name} ${date} sudah diselesaikan, tidak bisa diubah lagi.`);
    if (!op) {
      op = await tx.opname.create({ data: { warehouseId, date: toDbDate(date), createdById: userId } });
      summary.notes.push(`Opname draft baru dibuat: ${wh.name} ${date}.`);
    }
    const skuId = new Map<string, string>();
    for (const c of chunks(codes)) for (const s of await tx.sku.findMany({ where: { code: { in: c } }, select: { id: true, code: true } })) skuId.set(s.code, s.id);
    const ids = codes.map((c) => skuId.get(c)).filter((x): x is string => !!x);
    // per baris (per SKU), tidak menimpa hitungan SKU lain yang diinput bersamaan
    for (const c of chunks(ids)) await tx.opnameCount.deleteMany({ where: { opnameId: op.id, skuId: { in: c } } });
    const opId = op.id;
    for (const c of chunks(codes.filter((x) => skuId.has(x))))
      await tx.opnameCount.createMany({ data: c.map((code) => ({ opnameId: opId, skuId: skuId.get(code) as string, qty: counts[code], countedById: userId })) });
    summary.notes.push(`Cek selisihnya di Operasional → Stock opname, lalu klik Selesaikan.`);
  }, TX_OPTS);
  return summary;
}

/** Histori rata-rata jual harian: menggantikan histori lama seluruhnya (satu set data, sama seperti dokumen ops/history di HTML). */
export async function importHistory(avg: Record<string, number>, label: string, summary: ImportSummary): Promise<ImportSummary> {
  const codes = Object.keys(avg);
  if (!codes.length) return summary;
  await prisma.$transaction(async (tx) => {
    const skuId = new Map<string, string>();
    for (const c of chunks(codes)) for (const s of await tx.sku.findMany({ where: { code: { in: c } }, select: { id: true, code: true } })) skuId.set(s.code, s.id);
    const old = await tx.historyAvg.deleteMany({});
    const data = codes.filter((c) => skuId.has(c)).map((c) => ({ skuId: skuId.get(c) as string, avgDaily: avg[c], label: label || null }));
    for (const c of chunks(data)) await tx.historyAvg.createMany({ data: c });
    await tx.appConfig.upsert({ where: { id: 1 }, create: { id: 1, historyLabel: label || null }, update: { historyLabel: label || null } });
    if (old.count) summary.notes.push(`Histori lama (${old.count} SKU) diganti.`);
  }, TX_OPTS);
  return summary;
}

/** Info barang per varian. Sel kosong tidak menimpa data lama. */
export async function importProductInfo(items: PlannedInfo[], summary: ImportSummary): Promise<ImportSummary> {
  if (!items.length) return summary;
  await prisma.$transaction(async (tx) => {
    const brands = new Map((await tx.brand.findMany()).map((b) => [b.name, b.id]));
    for (const it of items) {
      const brandId = brands.get(it.brand);
      if (!brandId) continue;
      const data: Prisma.ProductInfoUncheckedUpdateInput = {};
      if (it.expiredAt !== undefined) data.expiredAt = toDbDate(it.expiredAt);
      if (it.notes !== undefined) data.notes = it.notes;
      if (it.lookUrl !== undefined) data.lookUrl = it.lookUrl.slice(0, 1000);
      await tx.productInfo.upsert({
        where: { brandId_productKey: { brandId, productKey: it.product } },
        create: { brandId, productKey: it.product, expiredAt: it.expiredAt ? toDbDate(it.expiredAt) : null, notes: it.notes ?? null, lookUrl: it.lookUrl ?? null },
        update: data,
      });
    }
  }, TX_OPTS);
  return summary;
}

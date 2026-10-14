import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guardedAction, type ActionResult } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { hppCalc, hppMasterChanges } from '@/lib/ops';
import { norm } from '@/lib/parse';
import { invalidate, TAGS } from '@/lib/repo/cache';
import { getOpsModel } from '@/lib/repo/ops';

const Id = z.string().min(1).max(40);
const Money = z.coerce.number().min(0, 'Tidak boleh minus').max(1e12);
const Ml = z.coerce.number().min(0, 'Tidak boleh minus').max(1e6);
const BrandName = z.string().trim().max(191);

function saved(message = 'Tersimpan'): ActionResult {
  invalidate(TAGS.ops, TAGS.marketplace);
  revalidatePath('/operasional', 'layout');
  return { ok: true, message };
}

const brandId = async (name: string) => (await prisma.brand.upsert({ where: { name }, create: { name }, update: {} })).id;

// ---------------------------------------------------------------------------
// Master SKU & HPP
// ---------------------------------------------------------------------------

export const skuUpdateImpl = guardedAction('OPS', z.object({ code: z.string().min(1).max(191), field: z.enum(['price', 'cogs']), value: Money }), async (v) => {
  const r = await prisma.sku.updateMany({ where: { code: v.code }, data: { [v.field]: v.value } });
  if (!r.count) return { ok: false, error: 'SKU tidak ditemukan' };
  return saved(v.field === 'cogs' ? `HPP master ${v.code} diperbarui` : `Harga jual ${v.code} diperbarui`);
});

export const skuAddImpl = guardedAction(
  'OPS',
  z.object({ code: z.string().trim().min(1, 'Isi SKU').max(191), brand: BrandName, product: z.string().trim().max(191), ml: Ml, price: Money, cogs: Money }),
  async (v) => {
    const ex = await prisma.sku.findUnique({ where: { code: v.code } });
    if (ex?.active) return { ok: false, error: `SKU ${v.code} sudah ada di master` };
    const data = { brandId: await brandId(v.brand), productKey: v.product, ml: v.ml, price: v.price, cogs: v.cogs, active: true };
    if (ex) await prisma.sku.update({ where: { id: ex.id }, data });
    else await prisma.sku.create({ data: { code: v.code, ...data } });
    return saved(`SKU ${v.code} ditambahkan`);
  },
);

/** Hapus dari master = nonaktif, supaya riwayat stok & pembelian tetap utuh. */
export const skuRemoveImpl = guardedAction('OPS', z.object({ code: z.string().min(1).max(191) }), async (v) => {
  await prisma.sku.updateMany({ where: { code: v.code }, data: { active: false } });
  return saved(`SKU ${v.code} dihapus dari master`);
});

export const hppApplyImpl = guardedAction('OPS', z.object({}), async () => {
  const m = await getOpsModel();
  const ch = hppMasterChanges(m, hppCalc(m));
  const codes = Object.keys(ch);
  if (!codes.length) return { ok: true, message: 'HPP master sudah sama dengan HPP sekarang' };
  await prisma.$transaction(codes.map((c) => prisma.sku.update({ where: { code: c }, data: { cogs: ch[c] } })));
  return saved(`${codes.length} HPP master diperbarui`);
});

// ---------------------------------------------------------------------------
// Pengaturan (susut, target, rata-rata, gudang utama & penjualan)
// ---------------------------------------------------------------------------

export const setConfigImpl = guardedAction(
  'OPS',
  z
    .object({
      shrinkPct: z.coerce.number().min(50, 'Susut minimal 50%').max(100, 'Maks. 100%'),
      targetDays: z.coerce.number().int().min(1).max(365),
      avgMode: z.enum(['HISTORY', 'LOG', 'MAX']),
      avgDays: z.coerce.number().int().min(7, 'Minimal 7 hari').max(365),
      mainWarehouseId: Id,
      salesWarehouseId: Id,
    })
    .partial(),
  async (v) => {
    for (const k of ['mainWarehouseId', 'salesWarehouseId'] as const)
      if (v[k] && !(await prisma.warehouse.count({ where: { id: v[k], active: true } }))) return { ok: false, error: 'Gudang tidak ditemukan' };
    await prisma.appConfig.upsert({ where: { id: 1 }, create: { id: 1, ...v }, update: v });
    invalidate(TAGS.ops, TAGS.marketplace, TAGS.finance);
    revalidatePath('/operasional', 'layout');
    return { ok: true, message: 'Pengaturan tersimpan' };
  },
);

// ---------------------------------------------------------------------------
// Gudang
// ---------------------------------------------------------------------------

export const warehouseAddImpl = guardedAction('OPS', z.object({ name: z.string().trim().min(1, 'Isi nama gudang').max(100) }), async (v) => {
  const used = new Set((await prisma.warehouse.findMany({ select: { code: true } })).map((w) => w.code));
  let code = norm(v.name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'gudang';
  while (used.has(code)) code += '2';
  const max = await prisma.warehouse.aggregate({ _max: { sortOrder: true } });
  await prisma.warehouse.create({ data: { code, name: v.name, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  return saved(`Gudang ${v.name} ditambahkan`);
});

export const warehouseRenameImpl = guardedAction('OPS', z.object({ id: Id, name: z.string().trim().min(1, 'Isi nama gudang').max(100) }), async (v) => {
  await prisma.warehouse.update({ where: { id: v.id }, data: { name: v.name } });
  return saved('Nama gudang diperbarui');
});

/** Gudang dinonaktifkan (stoknya tidak dihitung lagi), riwayat transaksinya tetap ada. */
export const warehouseRemoveImpl = guardedAction('OPS', z.object({ id: Id }), async (v) => {
  if ((await prisma.warehouse.count({ where: { active: true } })) <= 1) return { ok: false, error: 'Minimal harus ada satu gudang' };
  const cfg = await prisma.appConfig.findUnique({ where: { id: 1 } });
  if (cfg?.mainWarehouseId === v.id || cfg?.salesWarehouseId === v.id) return { ok: false, error: 'Gudang ini dipakai sebagai gudang utama / gudang penjualan. Ganti pengaturannya dulu.' };
  await prisma.warehouse.update({ where: { id: v.id }, data: { active: false } });
  return saved('Gudang dihapus');
});

// ---------------------------------------------------------------------------
// Aturan konversi & kemasan
// ---------------------------------------------------------------------------

const RuleFields = z.object({ brand: BrandName.min(1, 'Isi brand'), fromMl: Ml.positive('Isi ml sumber'), toMl: Ml.positive('Isi ml tujuan'), qtyPerBottle: z.coerce.number().min(0).max(1e6), packId: z.string().max(40).default('') });

export const ruleSaveImpl = guardedAction('OPS', RuleFields.extend({ id: z.string().max(40).default('') }), async (v) => {
  if (v.packId && !(await prisma.pack.count({ where: { id: v.packId } }))) return { ok: false, error: 'Kemasan tidak ditemukan' };
  const data = { brandId: await brandId(v.brand), fromMl: v.fromMl, toMl: v.toMl, qtyPerBottle: v.qtyPerBottle, packId: v.packId || null };
  const dup = await prisma.conversionRule.findUnique({ where: { brandId_fromMl_toMl: { brandId: data.brandId, fromMl: v.fromMl, toMl: v.toMl } } });
  if (dup && dup.id !== v.id) return { ok: false, error: `Aturan ${v.brand} ${v.fromMl}ml → ${v.toMl}ml sudah ada` };
  if (v.id) await prisma.conversionRule.update({ where: { id: v.id }, data });
  else await prisma.conversionRule.create({ data });
  return saved(v.id ? 'Aturan diperbarui' : 'Aturan ditambahkan');
});

export const ruleDeleteImpl = guardedAction('OPS', z.object({ id: Id }), async (v) => {
  await prisma.conversionRule.deleteMany({ where: { id: v.id } });
  return saved('Aturan dihapus');
});

export const packSaveImpl = guardedAction(
  'OPS',
  z.object({ id: z.string().max(40).default(''), name: z.string().trim().min(1, 'Isi nama kemasan').max(100), bottle: Money, sticker: Money, other: Money }),
  async ({ id, ...data }) => {
    if (id) await prisma.pack.update({ where: { id }, data });
    else await prisma.pack.create({ data });
    return saved(id ? 'Kemasan diperbarui' : 'Kemasan ditambahkan');
  },
);

export const packDeleteImpl = guardedAction('OPS', z.object({ id: Id }), async (v) => {
  await prisma.pack.deleteMany({ where: { id: v.id } });
  return saved('Kemasan dihapus. Aturan yang memakainya jadi tanpa kemasan.');
});

// ---------------------------------------------------------------------------
// Sumber fullsize & lead time
// ---------------------------------------------------------------------------

export const sourceSetImpl = guardedAction('OPS', z.object({ brand: BrandName, product: z.string().max(191), sku: z.string().max(191) }), async (v) => {
  const b = await prisma.brand.findUnique({ where: { name: v.brand } });
  if (!b) return { ok: false, error: 'Brand tidak ditemukan' };
  if (!v.sku) {
    await prisma.sourceOverride.deleteMany({ where: { brandId: b.id, productKey: v.product } });
    return saved('Sumber kembali otomatis');
  }
  const s = await prisma.sku.findUnique({ where: { code: v.sku } });
  if (!s || s.brandId !== b.id) return { ok: false, error: 'Sumber harus SKU fullsize dari brand yang sama' };
  await prisma.sourceOverride.upsert({ where: { brandId_productKey: { brandId: b.id, productKey: v.product } }, create: { brandId: b.id, productKey: v.product, skuId: s.id }, update: { skuId: s.id } });
  return saved(`Sumber ${v.product} → ${v.sku}`);
});

export const leadTimeSetImpl = guardedAction('OPS', z.object({ brand: BrandName.min(1, 'Isi brand'), days: z.union([z.null(), z.coerce.number().int().min(0).max(999)]) }), async (v) => {
  await prisma.brand.upsert({ where: { name: v.brand }, create: { name: v.brand, leadTimeDays: v.days }, update: { leadTimeDays: v.days } });
  return saved(v.days === null ? `Lead time ${v.brand} dihapus` : `Lead time ${v.brand}: ${v.days} hari`);
});

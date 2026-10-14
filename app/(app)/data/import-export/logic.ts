import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { guardedAction, type ActionResult } from '@/lib/auth/guard';
import { DEFAULT_FEES } from '@/lib/marketplace/types';
import { norm } from '@/lib/parse';
import { invalidate, TAGS } from '@/lib/repo/cache';
import { naiveTs, toDbDate } from '@/lib/repo/convert';
import { regenerateDailySales } from '@/lib/repo/imports';

const Id = z.string().min(1).max(40);
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Isi tanggal');
const Pct = z.coerce.number().min(0, 'Tidak boleh minus').max(100, 'Maks. 100%');

function done(message: string): ActionResult {
  revalidatePath('/data/import-export');
  revalidatePath('/data/import-export/iklan');
  return { ok: true, message };
}

/** Kode akun saldo toko berikutnya: 1-121, 1-122, … */
async function nextWalletCode(): Promise<string> {
  const used = new Set((await prisma.account.findMany({ where: { code: { startsWith: '1-12' } }, select: { code: true } })).map((a) => a.code));
  for (let i = 1; ; i++) if (!used.has(`1-12${i}`)) return `1-12${i}`;
}

export const createStoreImpl = guardedAction(
  'DATA',
  z.object({ name: z.string().trim().min(1, 'Isi nama toko').max(100), channel: z.enum(['SHOPEE', 'TIKTOK']), brand: z.string().trim().max(60) }),
  async (v) => {
    const f = DEFAULT_FEES[v.channel === 'TIKTOK' ? 'tiktok' : 'shopee'];
    const code = await nextWalletCode();
    await prisma.$transaction(async (tx) => {
      const acc = await tx.account.create({ data: { code, name: `Saldo ${v.name}`, type: 'ASSET', isSystem: true } });
      await tx.store.create({
        data: {
          name: v.name,
          channel: v.channel,
          brand: v.brand,
          feeAdmin: f.admin,
          feeFreeShip: f.freeShip,
          feeService: f.service,
          feeTax: f.tax,
          feeAms: f.ams,
          feeProcess: f.process,
          walletAccountId: acc.id,
        },
      });
    });
    invalidate(TAGS.marketplace, TAGS.finance);
    return done(`Toko ${v.name} dibuat`);
  },
);

export const updateStoreImpl = guardedAction(
  'DATA',
  z.object({
    storeId: Id,
    name: z.string().trim().min(1, 'Isi nama toko').max(100),
    brand: z.string().trim().max(60),
    feeAdmin: Pct,
    feeFreeShip: Pct,
    feeService: Pct,
    feeTax: Pct,
    feeAms: Pct,
    feeProcess: z.coerce.number().min(0).max(1_000_000),
  }),
  async ({ storeId, ...v }) => {
    const s = await prisma.store.update({ where: { id: storeId }, data: v });
    if (s.walletAccountId) await prisma.account.update({ where: { id: s.walletAccountId }, data: { name: `Saldo ${v.name}` } });
    invalidate(TAGS.marketplace, TAGS.finance);
    return done('Toko diperbarui');
  },
);

export const deleteStoreImpl = guardedAction('DATA', z.object({ storeId: Id, confirmName: z.string() }), async (v) => {
  const s = await prisma.store.findUnique({ where: { id: v.storeId } });
  if (!s) return { ok: false, error: 'Toko tidak ditemukan' };
  if (v.confirmName.trim() !== s.name) return { ok: false, error: 'Nama toko yang diketik tidak sama.' };
  await prisma.$transaction(
    async (tx) => {
      const dates = s.isDemo ? [] : [...new Set((await tx.order.findMany({ where: { storeId: s.id }, select: { createdAt: true } })).map((o) => naiveTs(o.createdAt).slice(0, 10)))];
      // pesanan, potongan, katalog, iklan ikut terhapus (cascade); akun saldo toko tetap ada untuk riwayat keuangan
      await tx.store.delete({ where: { id: s.id } });
      await regenerateDailySales(tx, dates);
    },
    { timeout: 180_000 },
  );
  invalidate(TAGS.marketplace, TAGS.ops, TAGS.finance);
  return done(`Toko ${s.name} beserta pesanan, potongan, dan iklannya dihapus`);
});

export const setTargetMarginImpl = guardedAction('DATA', z.object({ targetMargin: z.coerce.number().min(0, 'Tidak boleh minus').max(100, 'Maks. 100%') }), async (v) => {
  await prisma.appConfig.upsert({ where: { id: 1 }, create: { id: 1, targetMargin: v.targetMargin }, update: { targetMargin: v.targetMargin } });
  revalidatePath('/marketplace', 'layout');
  revalidatePath('/marketing', 'layout');
  return done(`Target margin bersih ${v.targetMargin}%`);
});

export const setAdMatchImpl = guardedAction(
  'DATA',
  z.object({ storeId: Id, adName: z.string().min(1).max(500), catalogKey: z.string().max(191) }),
  async (v) => {
    const adName = norm(v.adName);
    const cat = v.catalogKey ? await prisma.catalog.findUnique({ where: { storeId_externalKey: { storeId: v.storeId, externalKey: v.catalogKey } } }) : null;
    if (v.catalogKey && !cat) return { ok: false, error: 'Katalog tidak ditemukan' };
    await prisma.adCatalogMap.upsert({
      where: { storeId_adName: { storeId: v.storeId, adName } },
      create: { storeId: v.storeId, adName, catalogId: cat?.id ?? null, manual: true },
      update: { catalogId: cat?.id ?? null, manual: true },
    });
    invalidate(TAGS.marketplace);
    return done(cat ? 'Iklan dicocokkan ke katalog' : 'Iklan dibagi ke semua katalog toko');
  },
);

export const addManualAdImpl = guardedAction(
  'DATA',
  z
    .object({
      storeId: Id,
      from: DateStr,
      to: DateStr.optional().or(z.literal('')),
      catalogKey: z.string().max(191),
      amount: z.coerce.number().positive('Isi biaya iklan'),
      sales: z.coerce.number().min(0).default(0),
    })
    .refine((v) => !v.to || v.to >= v.from, { message: 'Tanggal sampai harus ≥ tanggal dari', path: ['to'] }),
  async (v) => {
    const cat = v.catalogKey ? await prisma.catalog.findUnique({ where: { storeId_externalKey: { storeId: v.storeId, externalKey: v.catalogKey } } }) : null;
    if (v.catalogKey && !cat) return { ok: false, error: 'Katalog tidak ditemukan' };
    await prisma.adRecord.create({
      data: {
        storeId: v.storeId,
        dateFrom: toDbDate(v.from),
        dateTo: toDbDate(v.to || v.from),
        adName: cat ? cat.name : 'Iklan toko (manual)',
        catalogId: cat?.id ?? null,
        amount: v.amount,
        sales: v.sales,
      },
    });
    invalidate(TAGS.marketplace);
    return done('Biaya iklan ditambahkan');
  },
);

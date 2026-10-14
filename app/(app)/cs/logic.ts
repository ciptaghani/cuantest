import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { guardedAction } from '@/lib/auth/guard';
import { isValidDateKey } from '@/lib/date';
import { prisma } from '@/lib/db';
import { toDbDate } from '@/lib/repo/convert';

/** Simpan info satu varian (berlaku untuk semua size). Isian kosong mengosongkan field itu, sama dengan HTML. */
export const saveInfoImpl = guardedAction(
  'CS',
  z.object({
    brand: z.string().trim().max(191),
    product: z.string().trim().max(191),
    expiredAt: z.union([z.literal(''), z.string().refine(isValidDateKey, 'Tanggal expired tidak valid')]).default(''),
    notes: z.string().trim().max(5000).default(''),
    lookUrl: z.union([z.literal(''), z.string().trim().max(1000).regex(/^https?:\/\//i, 'Link look visual harus diawali http:// atau https://')]).default(''),
  }),
  async (v) => {
    const sku = await prisma.sku.findFirst({ where: { brand: { name: v.brand }, productKey: v.product }, select: { brandId: true } });
    if (!sku) return { ok: false, error: 'Varian tidak ditemukan di master. Pilih dari daftar saran.' };
    const data = { expiredAt: v.expiredAt ? toDbDate(v.expiredAt) : null, notes: v.notes || null, lookUrl: v.lookUrl || null };
    await prisma.productInfo.upsert({
      where: { brandId_productKey: { brandId: sku.brandId, productKey: v.product } },
      create: { brandId: sku.brandId, productKey: v.product, ...data },
      update: data,
    });
    revalidatePath('/cs', 'layout');
    return { ok: true, message: `Info ${v.product} tersimpan` };
  },
);

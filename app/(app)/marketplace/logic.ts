import 'server-only';
import { z } from 'zod';
import { guardedAction } from '@/lib/auth/guard';
import { prisma } from '@/lib/db';
import { invalidate, TAGS } from '@/lib/repo/cache';
import { naiveTs } from '@/lib/repo/convert';
import { regenerateDailySales } from '@/lib/repo/imports';
import { catalogDetail, skuDetail, type CatalogDetail, type SkuDetail } from './rows';
import { loadMpView } from './view';

/** Rincian satu katalog / SKU untuk filter yang sama dengan tabel (dimuat saat baris dibuka). */
export const mpDetailImpl = guardedAction(
  'MARKETPLACE',
  z.object({ kind: z.enum(['kat', 'sku']), key: z.string().min(1).max(600), query: z.record(z.string().max(100)) }),
  async (v) => {
    const view = await loadMpView(v.query);
    if (!view.R) return { ok: false as const, error: 'Belum ada data pesanan.' };
    if (v.kind === 'kat') {
      const c = view.R.catalogs.find((x) => x.key === v.key);
      if (!c) return { ok: false as const, error: 'Katalog tidak ada di periode ini.' };
      return { ok: true as const, data: catalogDetail(c, view.data.skus, view.target) as CatalogDetail | SkuDetail };
    }
    const s = view.R.skus.find((x) => x.key === v.key);
    if (!s) return { ok: false as const, error: 'SKU tidak ada di periode ini.' };
    return { ok: true as const, data: skuDetail(s, view.data.skus) as CatalogDetail | SkuDetail };
  },
);

/**
 * Isi HPP SKU yang belum ada di master langsung dari rincian Marketplace (tombol "Simpan" HPP di HTML).
 * SKU baru dibuat tanpa brand; lengkapi brand & ukuran di Operasional → Master & aturan.
 */
export const setSkuCogsImpl = guardedAction('MARKETPLACE', z.object({ sku: z.string().trim().min(1).max(191), cogs: z.coerce.number().positive('Isi HPP dulu').max(1e12) }), async (v) => {
  const existing = await prisma.sku.findUnique({ where: { code: v.sku } });
  if (existing) await prisma.sku.update({ where: { id: existing.id }, data: { cogs: v.cogs, active: true } });
  else
    await prisma.$transaction(
      async (tx) => {
        const brand = await tx.brand.upsert({ where: { name: '' }, create: { name: '' }, update: {} });
        await tx.sku.create({ data: { code: v.sku, brandId: brand.id, productKey: '', cogs: v.cogs } });
        // penjualan lama dengan SKU ini sekarang ikut mengurangi stok
        const orders = await tx.order.findMany({ where: { store: { isDemo: false }, lines: { some: { skuCode: v.sku } } }, select: { createdAt: true } });
        await regenerateDailySales(tx, [...new Set(orders.map((o) => naiveTs(o.createdAt).slice(0, 10)))]);
      },
      { timeout: 120_000 },
    );
  invalidate(TAGS.marketplace, TAGS.ops, TAGS.finance);
  return { ok: true, message: `HPP ${v.sku} tersimpan` };
});

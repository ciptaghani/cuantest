import 'server-only';
import type { DateKey } from '@/lib/date';
import { prisma } from '@/lib/db';
import { variantKey } from '@/lib/ops/types';
import { dateKey } from './convert';

export interface ProductInfoRow {
  expiredAt: DateKey | '';
  notes: string;
  lookUrl: string;
  updatedAt: string;
}

/** Info barang per varian (kunci `brand||produk`, sama dengan csVariants). Tidak di-cache: tabel kecil, diubah CS kapan saja. */
export async function getProductInfos(): Promise<Record<string, ProductInfoRow>> {
  const rows = await prisma.productInfo.findMany({ include: { brand: { select: { name: true } } } });
  return Object.fromEntries(
    rows.map((i) => [
      variantKey(i.brand.name, i.productKey),
      { expiredAt: i.expiredAt ? dateKey(i.expiredAt) : '', notes: i.notes ?? '', lookUrl: i.lookUrl ?? '', updatedAt: i.updatedAt.toISOString() },
    ]),
  );
}

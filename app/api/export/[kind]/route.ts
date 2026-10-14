import { AuthError, authorizeAny } from '@/lib/auth/guard';
import type { Area } from '@/lib/auth/permissions';
import { todayKey } from '@/lib/date';
import { prisma } from '@/lib/db';
import { historyTemplate, opnameTemplate, productInfoTemplate, skuTemplate } from '@/lib/import/templates';
import { stockCalc } from '@/lib/ops/stock';
import { writeWorkbook, XLSX_MIME, type SheetSpec } from '@/lib/parse/workbook';
import { dateKey, num, toDbDate } from '@/lib/repo/convert';
import { getOpsModel } from '@/lib/repo/ops';

export const runtime = 'nodejs';

const AREAS: Record<string, Area[]> = {
  'sku-template': ['DATA'],
  'sku-master': ['DATA'],
  'opname-template': ['DATA', 'OPS'],
  'product-info-template': ['DATA', 'CS'],
  'history-template': ['DATA', 'OPS'],
};

const fail = (error: string, status = 400) => Response.json({ error }, { status });

function file(name: string, sheets: SheetSpec[]): Response {
  const body = writeWorkbook(sheets);
  return new Response(body, {
    headers: {
      'Content-Type': XLSX_MIME,
      'Content-Disposition': `attachment; filename="${name.replace(/[^\w .&()-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Download template / data dalam format Excel (nama kolom sama dengan versi HTML). */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }): Promise<Response> {
  const { kind } = await ctx.params;
  const areas = AREAS[kind];
  if (!areas) return fail('Jenis file tidak dikenal.', 404);
  try {
    await authorizeAny(areas);
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    throw e;
  }
  const sp = new URL(req.url).searchParams;
  const today = todayKey();

  switch (kind) {
    case 'sku-template':
      return file('Template Master SKU & HPP.xlsx', skuTemplate(null));

    case 'sku-master': {
      const skus = await prisma.sku.findMany({ include: { brand: true } });
      return file(
        `Master SKU & HPP ${today}.xlsx`,
        skuTemplate(skus.map((s) => ({ code: s.code, brand: s.brand.name, product: s.productKey, variant: s.variant, ml: num(s.ml), price: num(s.price), cogs: num(s.cogs) }))),
      );
    }

    case 'opname-template': {
      const wh = sp.get('warehouseId') || '';
      const date = sp.get('date') || '';
      const brand = sp.get('brand') || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Isi tanggal opname.');
      const warehouse = await prisma.warehouse.findUnique({ where: { id: wh } });
      if (!warehouse) return fail('Pilih gudang.');
      const m = await getOpsModel(today);
      const { st } = stockCalc(m, date, [wh]);
      const op = await prisma.opname.findUnique({ where: { warehouseId_date: { warehouseId: wh, date: toDbDate(date) } }, include: { counts: { include: { sku: true } } } });
      const counted = new Map((op?.counts ?? []).map((c) => [c.sku.code, c.qty]));
      const rows = Object.values(m.skuMap)
        .filter((s) => !brand || s.brand === brand)
        .sort((a, b) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product) || a.ml - b.ml)
        .map((s) => ({ brand: s.brand, code: s.code, recorded: st[s.code] ? st[s.code].now : 0, counted: counted.get(s.code) ?? null }));
      return file(`Template Stock Opname ${warehouse.name} ${date}${brand ? ' ' + brand : ''}.xlsx`, opnameTemplate(rows));
    }

    case 'history-template': {
      const m = await getOpsModel(today);
      const rows = Object.values(m.skuMap)
        .sort((a, b) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product) || a.ml - b.ml)
        .map((s) => ({ code: s.code, brand: s.brand, product: s.product, ml: s.ml, avg: m.history[s.code] ?? null }));
      return file(`Template Histori Penjualan ${today}.xlsx`, historyTemplate(rows));
    }

    case 'product-info-template': {
      const [skus, infos] = await Promise.all([
        prisma.sku.findMany({ where: { active: true }, select: { productKey: true, brandId: true, brand: { select: { name: true } } } }),
        prisma.productInfo.findMany(),
      ]);
      const info = new Map(infos.map((i) => [`${i.brandId}|${i.productKey}`, i]));
      const variants = new Map<string, { brand: string; product: string; key: string }>();
      for (const s of skus) if (s.brand.name || s.productKey) variants.set(`${s.brandId}|${s.productKey}`, { brand: s.brand.name, product: s.productKey, key: `${s.brandId}|${s.productKey}` });
      const rows = [...variants.values()]
        .sort((a, b) => a.brand.localeCompare(b.brand) || a.product.localeCompare(b.product))
        .map((v) => {
          const i = info.get(v.key);
          return { brand: v.brand, product: v.product, expiredAt: i?.expiredAt ? dateKey(i.expiredAt) : '', notes: i?.notes ?? '', lookUrl: i?.lookUrl ?? '' };
        });
      return file(`Template Info Barang ${today}.xlsx`, productInfoTemplate(rows));
    }
  }
  return fail('Jenis file tidak dikenal.', 404);
}
